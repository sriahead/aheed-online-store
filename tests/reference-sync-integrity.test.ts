import { describe, expect, it, vi } from "vitest";
import { applyPostcodeRecords, type PostcodeRecord } from "@/lib/reference-data/sources/code-point";
import { syncReferenceData } from "@/lib/reference-data/sync-service";
import type { Db, ReferenceDataSource } from "@/lib/reference-data/source";

/**
 * The guarantees the sync pipeline exists to provide (#764).
 *
 * Driven with a stub client and a stub source rather than a 14 MB download, because the properties
 * under test — a bad checksum aborts, an undersized area aborts, a failure preserves the previous
 * release, a re-run changes nothing, a disappeared record is retired rather than deleted, coverage
 * is written only on success, and **an unchanged upstream release still imports a newly required
 * area** — are about the ORCHESTRATION, not about the bytes.
 *
 * Note what is deliberately NOT stubbed: the checksum comparison is real `node:crypto`, so a test
 * asserting a mismatch aborts is asserting the actual verification rather than a mock of it.
 */

// ---------------------------------------------------------------------------
// A minimal in-memory stand-in for the reference tables.
// ---------------------------------------------------------------------------

interface StoredPostcode extends PostcodeRecord {
  isActive: boolean;
}

function makePostcodeStore(initial: StoredPostcode[] = []) {
  const rows = [...initial];

  return {
    rows,
    client: {
      postcodeReference: {
        async findMany({ where }: { where: { postcodeArea: { in: string[] } } }) {
          return rows.filter((row) => where.postcodeArea.in.includes(row.postcodeArea));
        },
        async createMany({ data }: { data: PostcodeRecord[] }) {
          for (const record of data) rows.push({ ...record, isActive: true });
          return { count: data.length };
        },
        async update({
          where,
          data,
        }: {
          where: { normalisedPostcode: string };
          data: Partial<StoredPostcode>;
        }) {
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
          const targets = rows.filter((r) =>
            where.normalisedPostcode.in.includes(r.normalisedPostcode),
          );
          for (const row of targets) Object.assign(row, data);
          return { count: targets.length };
        },
      },
    } as unknown as Db,
  };
}

function record(postcode: string, area = "MK", eastings = 100, northings = 200): PostcodeRecord {
  return {
    normalisedPostcode: postcode,
    displayPostcode: postcode,
    postcodeArea: area,
    postcodeDistrict: `${area}9`,
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

    const outcome = await applyPostcodeRecords(
      store.client,
      [record("MK92NW"), record("MK93BN")],
      ["MK"],
    );

    expect(outcome.inserted).toBe(2);
    expect(outcome.perArea).toEqual({ MK: 2 });
    expect(store.rows).toHaveLength(2);
  });

  it("is idempotent — applying the same release twice changes nothing the second time", async () => {
    const store = makePostcodeStore();
    const records = [record("MK92NW"), record("MK93BN")];

    await applyPostcodeRecords(store.client, records, ["MK"]);
    const second = await applyPostcodeRecords(store.client, records, ["MK"]);

    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.retired).toBe(0);
    expect(store.rows).toHaveLength(2);
  });

  it("updates a record whose coordinates moved", async () => {
    const store = makePostcodeStore();
    await applyPostcodeRecords(store.client, [record("MK92NW", "MK", 100, 200)], ["MK"]);

    const outcome = await applyPostcodeRecords(
      store.client,
      [record("MK92NW", "MK", 999, 888)],
      ["MK"],
    );

    expect(outcome.updated).toBe(1);
    expect(store.rows[0].eastings).toBe(999);
  });

  it("RETIRES a disappeared record rather than deleting it", async () => {
    // A postcode OS withdraws must stop being offered, but an Address or CustomerAddress already
    // holding it has to stay explicable rather than pointing at nothing.
    const store = makePostcodeStore();
    await applyPostcodeRecords(store.client, [record("MK92NW"), record("MK93BN")], ["MK"]);

    const outcome = await applyPostcodeRecords(store.client, [record("MK92NW")], ["MK"]);

    expect(outcome.retired).toBe(1);
    expect(store.rows).toHaveLength(2);
    expect(store.rows.find((r) => r.normalisedPostcode === "MK93BN")?.isActive).toBe(false);
  });

  it("does NOT retire another area's rows when importing one area", async () => {
    // The whole point of scoping retirement: adding LU must not silently deactivate every MK
    // postcode simply because they were not part of that pass.
    const store = makePostcodeStore();
    await applyPostcodeRecords(store.client, [record("MK92NW"), record("MK93BN")], ["MK"]);

    const outcome = await applyPostcodeRecords(store.client, [record("LU11AA", "LU")], ["LU"]);

    expect(outcome.retired).toBe(0);
    expect(store.rows.filter((r) => r.postcodeArea === "MK").every((r) => r.isActive)).toBe(true);
    expect(store.rows).toHaveLength(3);
  });

  it("revives a retired record that reappears in a later release", async () => {
    const store = makePostcodeStore();
    await applyPostcodeRecords(store.client, [record("MK92NW"), record("MK93BN")], ["MK"]);
    await applyPostcodeRecords(store.client, [record("MK92NW")], ["MK"]);

    const outcome = await applyPostcodeRecords(
      store.client,
      [record("MK92NW"), record("MK93BN")],
      ["MK"],
    );

    expect(outcome.updated).toBe(1);
    expect(store.rows.find((r) => r.normalisedPostcode === "MK93BN")?.isActive).toBe(true);
  });

  it("counts records per area, so coverage can be recorded for each", async () => {
    const store = makePostcodeStore();

    const outcome = await applyPostcodeRecords(
      store.client,
      [record("MK92NW"), record("MK93BN"), record("RG11AA", "RG")],
      ["MK", "RG"],
    );

    expect(outcome.perArea).toEqual({ MK: 2, RG: 1 });
  });
});

// ---------------------------------------------------------------------------
// The orchestration: two change dimensions, verification, validation, coverage.
// ---------------------------------------------------------------------------

function makeDatasetStore(coverage: { postcodeArea: string; sourceVersion: string }[] = []) {
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
  const coverageRows = coverage.map((row) => ({ sourceKey: "stub", recordCount: 1, ...row }));

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
    referenceAreaCoverage: {
      async findMany({
        where,
      }: {
        where: { sourceKey: string; postcodeArea?: { in: string[] }; sourceVersion?: string };
      }) {
        return coverageRows.filter(
          (row) =>
            row.sourceKey === where.sourceKey &&
            (!where.postcodeArea || where.postcodeArea.in.includes(row.postcodeArea)) &&
            (!where.sourceVersion || row.sourceVersion === where.sourceVersion),
        );
      },
      async upsert({
        where,
        create,
        update,
      }: {
        where: { sourceKey_postcodeArea: { sourceKey: string; postcodeArea: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        const key = where.sourceKey_postcodeArea;
        const found = coverageRows.find(
          (row) => row.sourceKey === key.sourceKey && row.postcodeArea === key.postcodeArea,
        );
        if (found) Object.assign(found, update);
        else coverageRows.push(create as (typeof coverageRows)[number]);
        return found ?? create;
      },
    },
  } as unknown as Db;

  return { dataset, runs, coverageRows, client };
}

const PAYLOAD = new Uint8Array([1, 2, 3, 4]);
/** md5 of the four bytes above, so the happy path verifies a real checksum. */
const PAYLOAD_MD5 = "08d6c05a21512a79a1dfeb9d2a8f262f";

function stubSource(
  overrides: Partial<ReferenceDataSource<string>> = {},
): ReferenceDataSource<string> {
  return {
    key: "stub",
    displayName: "Stub source",
    refreshFrequencyDays: 30,
    minimumRecordsPerArea: 2,
    discoverLatest: async () => ({
      version: "2026-08",
      checksum: PAYLOAD_MD5,
      downloadUrl: "https://example.invalid/archive.zip",
      sizeBytes: PAYLOAD.length,
    }),
    download: async () => PAYLOAD,
    parse: () => ["a", "b", "c"],
    validate: (records) => (records.length >= 2 ? { ok: true } : { ok: false, error: "too few" }),
    apply: async (_prisma, _records, _version, areas) => ({
      inserted: 3,
      updated: 0,
      retired: 0,
      perArea: Object.fromEntries(areas.map((area) => [area, 3])),
    }),
    ...overrides,
  };
}

const opts = (areas: string[], extra: Record<string, unknown> = {}) => ({
  areas,
  log: () => {},
  ...extra,
});

describe("syncReferenceData", () => {
  it("imports and activates on the happy path", async () => {
    const store = makeDatasetStore();

    const summary = await syncReferenceData(store.client, stubSource(), opts(["MK"]));

    expect(summary.status).toBe("SUCCEEDED");
    expect(summary.changed).toBe(true);
    expect(summary.importedAreas).toEqual(["MK"]);
    expect(store.dataset.cacheVersion).toBe(1);
    expect(store.dataset.lastSyncedAt).not.toBeNull();
  });

  it("writes a coverage row for each imported area", async () => {
    const store = makeDatasetStore();

    await syncReferenceData(store.client, stubSource(), opts(["MK", "RG"]));

    expect(store.coverageRows.map((row) => row.postcodeArea).sort()).toEqual(["MK", "RG"]);
  });

  describe("the two change dimensions", () => {
    it("exits without downloading when the release AND coverage are both unchanged", async () => {
      const store = makeDatasetStore();
      const download = vi.fn(async () => PAYLOAD);
      await syncReferenceData(store.client, stubSource(), opts(["MK"]));
      const cacheVersionAfterImport = store.dataset.cacheVersion;

      const summary = await syncReferenceData(store.client, stubSource({ download }), opts(["MK"]));

      expect(summary.changed).toBe(false);
      expect(download).not.toHaveBeenCalled();
      expect(store.dataset.cacheVersion).toBe(cacheVersionAfterImport);
    });

    it("STILL IMPORTS a newly required area when the upstream release is unchanged", async () => {
      // The case a checksum-only check gets wrong, silently. The publisher has not moved, but LU is
      // newly configured and has no data — exiting `changed=false` here would mean it never
      // imports, with no error and no output.
      const store = makeDatasetStore();
      await syncReferenceData(store.client, stubSource(), opts(["MK", "RG"]));

      const download = vi.fn(async () => PAYLOAD);
      const summary = await syncReferenceData(
        store.client,
        stubSource({ download }),
        opts(["MK", "RG", "LU"]),
      );

      expect(summary.changed).toBe(true);
      expect(summary.importedAreas).toEqual(["LU"]);
      expect(download).toHaveBeenCalled();
      expect(store.coverageRows.map((r) => r.postcodeArea).sort()).toEqual(["LU", "MK", "RG"]);
    });

    it("re-imports every area when the upstream version moves", async () => {
      const store = makeDatasetStore();
      await syncReferenceData(store.client, stubSource(), opts(["MK", "RG"]));

      const summary = await syncReferenceData(
        store.client,
        stubSource({
          discoverLatest: async () => ({
            version: "2026-09",
            checksum: PAYLOAD_MD5,
            downloadUrl: "https://example.invalid/a.zip",
            sizeBytes: 4,
          }),
        }),
        opts(["MK", "RG"]),
      );

      // A new version makes every area stale, which falls out of matching coverage on version
      // rather than needing a special case.
      expect(summary.importedAreas).toEqual(["MK", "RG"]);
    });

    it("fails rather than guessing when no areas are configured", async () => {
      const store = makeDatasetStore();

      const summary = await syncReferenceData(store.client, stubSource(), opts([]));

      expect(summary.status).toBe("FAILED");
      expect(summary.error).toMatch(/no postcode areas configured/i);
    });
  });

  it("refuses to parse an archive whose checksum does not match", async () => {
    const store = makeDatasetStore();
    const parse = vi.fn(() => ["a", "b", "c"]);

    const summary = await syncReferenceData(
      store.client,
      stubSource({ download: async () => new Uint8Array([9, 9, 9]), parse }),
      opts(["MK"]),
    );

    expect(summary.status).toBe("FAILED");
    expect(summary.error).toMatch(/checksum mismatch/i);
    expect(parse).not.toHaveBeenCalled();
  });

  it("refuses a release whose area parses to too few records", async () => {
    const store = makeDatasetStore();
    const apply = vi.fn();

    const summary = await syncReferenceData(
      store.client,
      stubSource({ parse: () => ["only-one"], apply }),
      opts(["MK"]),
    );

    expect(summary.status).toBe("FAILED");
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses a release whose schema moved, without mutating anything", async () => {
    const store = makeDatasetStore();
    const apply = vi.fn();

    const summary = await syncReferenceData(
      store.client,
      stubSource({
        parse: () => {
          throw new Error("required column(s) missing from source header: Eastings");
        },
        apply,
      }),
      opts(["MK"]),
    );

    expect(summary.status).toBe("FAILED");
    expect(summary.error).toMatch(/required column/i);
    expect(apply).not.toHaveBeenCalled();
  });

  it("writes NO coverage row for an area whose import failed", async () => {
    // The real-world instance: the first Open Names attempt died mid-write, and the absence of a
    // coverage row is exactly what stopped 40,000 orphaned rows being treated as authoritative.
    const store = makeDatasetStore();

    await syncReferenceData(
      store.client,
      stubSource({
        apply: async () => {
          throw new Error("could not extend file because project size limit exceeded");
        },
      }),
      opts(["MK"]),
    );

    expect(store.coverageRows).toHaveLength(0);
    expect(store.dataset.lastSyncedAt).toBeNull();
  });

  it("leaves the previous known-good release intact when a run fails", async () => {
    const store = makeDatasetStore();
    await syncReferenceData(store.client, stubSource(), opts(["MK"]));

    const before = {
      version: store.dataset.sourceVersion,
      checksum: store.dataset.sourceChecksum,
      recordCount: store.dataset.recordCount,
      cacheVersion: store.dataset.cacheVersion,
      lastSyncedAt: store.dataset.lastSyncedAt,
      coverage: store.coverageRows.length,
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
      opts(["MK"]),
    );

    expect(store.dataset.sourceVersion).toBe(before.version);
    expect(store.dataset.sourceChecksum).toBe(before.checksum);
    expect(store.dataset.recordCount).toBe(before.recordCount);
    expect(store.dataset.cacheVersion).toBe(before.cacheVersion);
    expect(store.dataset.lastSyncedAt).toBe(before.lastSyncedAt);
    expect(store.coverageRows).toHaveLength(before.coverage);
    expect(store.dataset.syncStatus).toBe("FAILED");
  });

  it("records a run even when nothing changed, so a silent schedule is distinguishable", async () => {
    const store = makeDatasetStore();
    await syncReferenceData(store.client, stubSource(), opts(["MK"]));
    await syncReferenceData(store.client, stubSource(), opts(["MK"]));

    expect(store.runs).toHaveLength(2);
    expect(store.runs[1].status).toBe("SUCCEEDED");
    expect(store.runs[1].requestedAreas).toBe("MK");
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
      opts(["MK"]),
    );

    expect(store.runs[0].status).toBe("FAILED");
    expect(store.runs[0].errorMessage).toMatch(/boom/);
  });

  it("re-imports an unchanged release when forced", async () => {
    const store = makeDatasetStore();
    await syncReferenceData(store.client, stubSource(), opts(["MK"]));

    const summary = await syncReferenceData(
      store.client,
      stubSource(),
      opts(["MK"], { force: true }),
    );

    expect(summary.changed).toBe(true);
    expect(store.dataset.cacheVersion).toBe(2);
  });
});
