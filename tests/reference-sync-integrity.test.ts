import { describe, expect, it, vi } from "vitest";
import { applyPostcodeRecords, type PostcodeRecord } from "@/lib/reference-data/sources/code-point";
import { syncReferenceData } from "@/lib/reference-data/sync-service";
import type { Db, ReferenceDataSource } from "@/lib/reference-data/source";

/**
 * The guarantees the sync pipeline exists to provide (#764).
 *
 * These are driven with a stub client and a stub source rather than a 14 MB download, because the
 * properties under test — a bad checksum aborts, a shrunken dataset aborts, a failure preserves the
 * previous release, a re-run changes nothing, a disappeared record is retired rather than deleted —
 * are about the ORCHESTRATION, not about the bytes. The real archives are exercised separately by
 * running `scripts/sync-reference-data.ts` against a live database.
 *
 * Note what is deliberately NOT stubbed: the checksum comparison is real `node:crypto`, so a test
 * asserting a mismatch aborts is asserting the actual verification, not a mock of it.
 */

// ---------------------------------------------------------------------------
// A minimal in-memory stand-in for the reference tables.
// ---------------------------------------------------------------------------

interface StoredPostcode extends PostcodeRecord {
  id: string;
  isActive: boolean;
  sourceVersion: string;
}

function makePostcodeStore(initial: StoredPostcode[] = []) {
  const rows = [...initial];
  let nextId = rows.length + 1;

  return {
    rows,
    client: {
      postcodeReference: {
        async findMany({
          take,
          cursor,
          skip,
        }: {
          take: number;
          cursor?: { id: string };
          skip?: number;
        }) {
          // prettier-ignore
          const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
          const start = cursor ? sorted.findIndex((r) => r.id === cursor.id) + (skip ?? 0) : 0;
          return sorted.slice(start, start + take);
        },
        async createMany({ data }: { data: (PostcodeRecord & { sourceVersion: string })[] }) {
          for (const record of data) {
            rows.push({ ...record, id: `id-${nextId++}`, isActive: true });
          }
          return { count: data.length };
        },
        async update({
          where,
          data,
        }: {
          where: { normalisedPostcode: string };
          data: Partial<StoredPostcode>;
        }) {
          // prettier-ignore
          const row = rows.find((r) => r.normalisedPostcode === where.normalisedPostcode);
          if (row) Object.assign(row, data);
          return row;
        },
        async updateMany({
          where,
          data,
        }: {
          where: { normalisedPostcode: { in: string[] } };
          data: Partial<StoredPostcode>;
        }) {
          // prettier-ignore
          const targets = rows.filter((r) => where.normalisedPostcode.in.includes(r.normalisedPostcode)); // prettier-ignore
          for (const row of targets) Object.assign(row, data);
          return { count: targets.length };
        },
      },
    } as unknown as Db,
  };
}

function record(postcode: string, eastings = 100, northings = 200): PostcodeRecord {
  return {
    normalisedPostcode: postcode,
    displayPostcode: postcode,
    postcodeArea: "MK",
    postcodeDistrict: "MK9",
    eastings,
    northings,
    adminDistrictCode: "E06000042",
    adminCountyCode: null,
    countryCode: "E92000001",
  };
}

describe("applyPostcodeRecords", () => {
  it("inserts everything into an empty table", async () => {
    const store = makePostcodeStore();

    const outcome = await applyPostcodeRecords(store.client, [record("MK92NW"), record("MK93BN")], "2026-08"); // prettier-ignore

    expect(outcome).toEqual({ inserted: 2, updated: 0, retired: 0 });
    expect(store.rows).toHaveLength(2);
  });

  it("is idempotent — applying the same release twice changes nothing the second time", async () => {
    const store = makePostcodeStore();
    const records = [record("MK92NW"), record("MK93BN")];

    await applyPostcodeRecords(store.client, records, "2026-08");
    const second = await applyPostcodeRecords(store.client, records, "2026-08");

    expect(second).toEqual({ inserted: 0, updated: 0, retired: 0 });
    expect(store.rows).toHaveLength(2);
  });

  it("updates a record whose coordinates moved", async () => {
    const store = makePostcodeStore();
    await applyPostcodeRecords(store.client, [record("MK92NW", 100, 200)], "2026-08");

    const outcome = await applyPostcodeRecords(store.client, [record("MK92NW", 999, 888)], "2026-09"); // prettier-ignore

    expect(outcome).toEqual({ inserted: 0, updated: 1, retired: 0 });
    expect(store.rows[0].eastings).toBe(999);
  });

  it("RETIRES a disappeared record rather than deleting it", async () => {
    // A postcode OS withdraws must stop being offered, but an Address or CustomerAddress already
    // holding it has to stay explicable rather than pointing at nothing.
    const store = makePostcodeStore();
    await applyPostcodeRecords(store.client, [record("MK92NW"), record("MK93BN")], "2026-08");

    const outcome = await applyPostcodeRecords(store.client, [record("MK92NW")], "2026-09");

    expect(outcome.retired).toBe(1);
    expect(store.rows).toHaveLength(2);
    expect(store.rows.find((r) => r.normalisedPostcode === "MK93BN")?.isActive).toBe(false);
  });

  it("revives a retired record that reappears in a later release", async () => {
    const store = makePostcodeStore();
    await applyPostcodeRecords(store.client, [record("MK92NW"), record("MK93BN")], "2026-08");
    await applyPostcodeRecords(store.client, [record("MK92NW")], "2026-09");

    const outcome = await applyPostcodeRecords(store.client, [record("MK92NW"), record("MK93BN")], "2026-10"); // prettier-ignore

    expect(outcome.updated).toBe(1);
    expect(store.rows.find((r) => r.normalisedPostcode === "MK93BN")?.isActive).toBe(true);
  });

  it("does not retire a record that is already inactive", async () => {
    const store = makePostcodeStore();
    await applyPostcodeRecords(store.client, [record("MK92NW"), record("MK93BN")], "2026-08");
    await applyPostcodeRecords(store.client, [record("MK92NW")], "2026-09");

    const outcome = await applyPostcodeRecords(store.client, [record("MK92NW")], "2026-10");

    expect(outcome.retired).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The orchestration: change detection, verification, validation, activation.
// ---------------------------------------------------------------------------

function makeDatasetStore() {
  const dataset: Record<string, unknown> = {
    id: "dataset-1",
    sourceKey: "stub",
    sourceVersion: null,
    sourceChecksum: null,
    recordCount: 0,
    cacheVersion: 0,
    lastSyncedAt: null,
    syncStatus: "IDLE",
    syncError: null,
  };
  const runs: Record<string, unknown>[] = [];

  const client = {
    referenceDataset: {
      async findUnique() {
        return dataset;
      },
      async create() {
        return dataset;
      },
      async update({ data }: { data: Record<string, unknown> }) {
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === "object" && "increment" in value) {
            dataset[key] = (dataset[key] as number) + (value as { increment: number }).increment;
          } else {
            dataset[key] = value;
          }
        }
        return dataset;
      },
    },
    referenceDataSyncRun: {
      async create({ data }: { data: Record<string, unknown> }) {
        const run = { id: `run-${runs.length + 1}`, ...data };
        runs.push(run);
        return run;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const run = runs.find((r) => r.id === where.id);
        if (run) Object.assign(run, data);
        return run;
      },
    },
  } as unknown as Db;

  return { dataset, runs, client };
}

const PAYLOAD = new Uint8Array([1, 2, 3, 4]);
/** md5 of the four bytes above, so the happy path verifies a real checksum. */
const PAYLOAD_MD5 = "08d6c05a21512a79a1dfeb9d2a8f262f";

function stubSource(
  overrides: Partial<ReferenceDataSource<string>> = {},
): ReferenceDataSource<string> {
  // prettier-ignore
  return {
    key: "stub",
    displayName: "Stub source",
    refreshFrequencyDays: 30,
    minimumRecordCount: 2,
    discoverLatest: async () => ({
      version: "2026-08",
      checksum: PAYLOAD_MD5,
      downloadUrl: "https://example.invalid/archive.zip",
      sizeBytes: PAYLOAD.length,
    }),
    download: async () => PAYLOAD,
    parse: () => ["a", "b", "c"],
    validate: (records) => (records.length >= 2 ? { ok: true } : { ok: false, error: "too few" }),
    apply: async () => ({ inserted: 3, updated: 0, retired: 0 }),
    ...overrides,
  };
}

const silent = { log: () => {} };

describe("syncReferenceData", () => {
  it("imports and activates on the happy path", async () => {
    const store = makeDatasetStore();

    const summary = await syncReferenceData(store.client, stubSource(), silent);

    expect(summary.status).toBe("SUCCEEDED");
    expect(summary.changed).toBe(true);
    expect(store.dataset.cacheVersion).toBe(1);
    expect(store.dataset.lastSyncedAt).not.toBeNull();
    expect(store.dataset.sourceVersion).toBe("2026-08");
  });

  it("exits without downloading when version and checksum both match", async () => {
    const store = makeDatasetStore();
    const download = vi.fn(async () => PAYLOAD);
    await syncReferenceData(store.client, stubSource(), silent);
    const cacheVersionAfterImport = store.dataset.cacheVersion;

    const summary = await syncReferenceData(store.client, stubSource({ download }), silent);

    expect(summary.changed).toBe(false);
    expect(summary.inserted).toBe(0);
    expect(download).not.toHaveBeenCalled();
    // Activation must NOT move for a run that did nothing.
    expect(store.dataset.cacheVersion).toBe(cacheVersionAfterImport);
  });

  it("records a run even when nothing changed, so a silent schedule is distinguishable", async () => {
    const store = makeDatasetStore();
    await syncReferenceData(store.client, stubSource(), silent);
    await syncReferenceData(store.client, stubSource(), silent);

    expect(store.runs).toHaveLength(2);
    expect(store.runs[1].status).toBe("SUCCEEDED");
  });

  it("refuses to parse an archive whose checksum does not match", async () => {
    const store = makeDatasetStore();
    const parse = vi.fn(() => ["a", "b", "c"]);

    const summary = await syncReferenceData(
      store.client,
      stubSource({ download: async () => new Uint8Array([9, 9, 9]), parse }),
      silent,
    );

    expect(summary.status).toBe("FAILED");
    expect(summary.error).toMatch(/checksum mismatch/i);
    expect(parse).not.toHaveBeenCalled();
  });

  it("refuses a release that parses to fewer records than the source's minimum", async () => {
    const store = makeDatasetStore();
    const apply = vi.fn(async () => ({ inserted: 0, updated: 0, retired: 0 }));

    const summary = await syncReferenceData(
      store.client,
      stubSource({ parse: () => ["only-one"], apply }),
      silent,
    );

    expect(summary.status).toBe("FAILED");
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses a release whose schema moved, without mutating anything", async () => {
    const store = makeDatasetStore();
    const apply = vi.fn(async () => ({ inserted: 0, updated: 0, retired: 0 }));

    const summary = await syncReferenceData(
      store.client,
      stubSource({
        parse: () => {
          throw new Error("required column(s) missing from source header: Eastings");
        },
        apply,
      }),
      silent,
    );

    expect(summary.status).toBe("FAILED");
    expect(summary.error).toMatch(/required column/i);
    expect(apply).not.toHaveBeenCalled();
  });

  it("leaves the previous known-good release intact when a run fails", async () => {
    const store = makeDatasetStore();
    await syncReferenceData(store.client, stubSource(), silent);

    const before = {
      version: store.dataset.sourceVersion,
      checksum: store.dataset.sourceChecksum,
      recordCount: store.dataset.recordCount,
      cacheVersion: store.dataset.cacheVersion,
      lastSyncedAt: store.dataset.lastSyncedAt,
    };

    await syncReferenceData(
      store.client,
      stubSource({
        discoverLatest: async () => ({
          version: "2026-09",
          checksum: "different",
          downloadUrl: "https://example.invalid/a.zip",
          sizeBytes: 4,
        }),
        download: async () => {
          throw new Error("network died mid-download");
        },
      }),
      silent,
    );

    expect(store.dataset.sourceVersion).toBe(before.version);
    expect(store.dataset.sourceChecksum).toBe(before.checksum);
    expect(store.dataset.recordCount).toBe(before.recordCount);
    expect(store.dataset.cacheVersion).toBe(before.cacheVersion);
    expect(store.dataset.lastSyncedAt).toBe(before.lastSyncedAt);
    expect(store.dataset.syncStatus).toBe("FAILED");
    expect(store.dataset.syncError).toMatch(/network died/);
  });

  it("records a FAILED run with a reason", async () => {
    const store = makeDatasetStore();

    await syncReferenceData(
      store.client,
      stubSource({
        download: async () => {
          throw new Error("boom");
        },
      }),
      silent,
    );

    expect(store.runs[0].status).toBe("FAILED");
    expect(store.runs[0].errorMessage).toMatch(/boom/);
  });

  it("re-imports an unchanged release when forced", async () => {
    const store = makeDatasetStore();
    await syncReferenceData(store.client, stubSource(), silent);

    const summary = await syncReferenceData(store.client, stubSource(), { ...silent, force: true });

    expect(summary.changed).toBe(true);
    expect(store.dataset.cacheVersion).toBe(2);
  });
});
