import { describe, expect, it, vi } from "vitest";
import { decommissionPostcodeAreas } from "@/lib/reference-data/sources/code-point";
import { decommissionPlaceAreas } from "@/lib/reference-data/sources/open-names";
import { decommissionUnsupportedAreas } from "@/lib/reference-data/sync-service";
import type { Db, ReferenceDataSource } from "@/lib/reference-data/source";

/**
 * Retiring a postcode area that is no longer supported (#770).
 *
 * The property this file exists to pin is an ORDERING one, and it is a correctness property rather
 * than a tidiness one. `ReferenceAreaCoverage` is what makes an area authoritative: covered area
 * plus no active row is the one combination that yields INVALID, i.e. telling a customer their own
 * address is wrong. So deleting an area's rows while its coverage row survives publishes exactly
 * that state for the duration of the run. Removing coverage first degrades the area to UNVERIFIED,
 * where the worst outcome is manual address entry.
 *
 * Driven with stub clients, because every property here — ordering, the two refusals, and the
 * scoping of each delete — is about the orchestration rather than about Postgres.
 */

// ---------------------------------------------------------------------------
// A stub that records the ORDER of every call, which is the point of the file.
// ---------------------------------------------------------------------------

interface CoverageRow {
  sourceKey: string;
  postcodeArea: string;
  sourceVersion: string;
  recordCount: number;
  materialisedAt: Date;
}

function makeStore(coverage: CoverageRow[]) {
  const calls: string[] = [];
  const rows = [...coverage];
  let datasetUpdate: Record<string, unknown> | null = null;
  const runs: Record<string, unknown>[] = [];

  const client = {
    referenceAreaCoverage: {
      async findMany({ where }: { where: { sourceKey: string } }) {
        calls.push(`coverage.findMany:${where.sourceKey}`);
        return rows
          .filter((row) => row.sourceKey === where.sourceKey)
          .sort((a, b) => a.postcodeArea.localeCompare(b.postcodeArea));
      },
      async deleteMany({ where }: { where: { sourceKey: string; postcodeArea: string } }) {
        calls.push(`coverage.deleteMany:${where.postcodeArea}`);
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (
            rows[i].sourceKey === where.sourceKey &&
            rows[i].postcodeArea === where.postcodeArea
          ) {
            rows.splice(i, 1);
          }
        }
        return { count: before - rows.length };
      },
    },
    referenceDataset: {
      async findUnique() {
        return { id: "dataset-1", sourceKey: "code-point-open", sourceVersion: "2026-08" };
      },
      async create() {
        return { id: "dataset-1", sourceKey: "code-point-open", sourceVersion: "2026-08" };
      },
      async update({ data }: { data: Record<string, unknown> }) {
        calls.push("dataset.update");
        datasetUpdate = data;
        return { id: "dataset-1" };
      },
    },
    referenceDataSyncRun: {
      async create({ data }: { data: Record<string, unknown> }) {
        calls.push("run.create");
        runs.push({ ...data });
        return { id: "run-1" };
      },
      async update({ data }: { data: Record<string, unknown> }) {
        calls.push("run.update");
        runs.push({ ...data });
        return { id: "run-1" };
      },
    },
  } as unknown as Db;

  return {
    client,
    calls,
    rows,
    runs,
    get datasetUpdate() {
      return datasetUpdate;
    },
  };
}

function coverage(area: string, records = 100, sourceKey = "code-point-open"): CoverageRow {
  return {
    sourceKey,
    postcodeArea: area,
    sourceVersion: "2026-08",
    recordCount: records,
    materialisedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
}

/** A source that records which lifecycle methods were called, so we can assert the ones that weren't. */
function makeSource(deleted = 42) {
  const decommissionAreas = vi.fn(async (_prisma: Db, _areas: string[]) => ({ deleted }));
  const discoverLatest = vi.fn(async () => {
    throw new Error("discoverLatest must not be called during a decommission");
  });
  const download = vi.fn(async () => new Uint8Array());
  const parse = vi.fn(() => []);
  const validate = vi.fn(() => ({ ok: true }) as const);
  const apply = vi.fn(async () => ({ inserted: 0, updated: 0, retired: 0, perArea: {} }));

  const source = {
    key: "code-point-open",
    displayName: "OS Code-Point Open",
    refreshFrequencyDays: 30,
    minimumRecordsPerArea: 1,
    discoverLatest,
    download,
    parse,
    validate,
    apply,
    decommissionAreas,
  } as unknown as ReferenceDataSource<unknown>;

  return { source, decommissionAreas, discoverLatest, download, parse, validate, apply };
}

describe("decommissionUnsupportedAreas", () => {
  it("removes an area that is covered but not required", async () => {
    const store = makeStore([coverage("MK", 16215), coverage("RG", 23816), coverage("LU", 6464)]);
    const { source, decommissionAreas } = makeSource(6464);

    const summary = await decommissionUnsupportedAreas(store.client, source, {
      areas: ["MK", "RG"],
      log: () => {},
    });

    expect(summary.status).toBe("SUCCEEDED");
    expect(summary.removedAreas).toEqual(["LU"]);
    expect(summary.deleted).toBe(6464);
    expect(decommissionAreas).toHaveBeenCalledWith(store.client, ["LU"]);
    expect(store.rows.map((row) => row.postcodeArea).sort()).toEqual(["MK", "RG"]);
  });

  it("deletes the COVERAGE ROW BEFORE the data rows", async () => {
    // The property the whole feature turns on. Reversed, every postcode in the area reads as
    // INVALID for the duration of the run — an authoritative claim that a real address is wrong.
    const store = makeStore([coverage("MK"), coverage("LU")]);
    const { source } = makeSource();
    const order: string[] = [];

    const recordingSource = {
      ...source,
      decommissionAreas: async (_prisma: Db, areas: string[]) => {
        order.push(`data.delete:${areas.join(",")}`);
        return { deleted: 1 };
      },
    } as unknown as ReferenceDataSource<unknown>;

    // The stub pushes coverage.deleteMany into `store.calls`; interleave both streams by timestamp
    // of call rather than trusting either alone.
    const originalDeleteMany = (
      store.client as unknown as {
        referenceAreaCoverage: { deleteMany: (args: unknown) => Promise<{ count: number }> };
      }
    ).referenceAreaCoverage.deleteMany;
    (
      store.client as unknown as {
        referenceAreaCoverage: { deleteMany: (args: unknown) => Promise<{ count: number }> };
      }
    ).referenceAreaCoverage.deleteMany = async (args: unknown) => {
      order.push(`coverage.delete:${(args as { where: { postcodeArea: string } }).where.postcodeArea}`); // prettier-ignore
      return originalDeleteMany(args);
    };

    await decommissionUnsupportedAreas(store.client, recordingSource, {
      areas: ["MK"],
      log: () => {},
    });

    expect(order).toEqual(["coverage.delete:LU", "data.delete:LU"]);
  });

  it("does nothing at all when coverage already matches configuration", async () => {
    const store = makeStore([coverage("MK"), coverage("RG")]);
    const { source, decommissionAreas } = makeSource();

    const summary = await decommissionUnsupportedAreas(store.client, source, {
      areas: ["MK", "RG"],
      log: () => {},
    });

    expect(summary.status).toBe("SUCCEEDED");
    expect(summary.removedAreas).toEqual([]);
    expect(decommissionAreas).not.toHaveBeenCalled();
    expect(store.calls.filter((call) => call.includes("delete"))).toEqual([]);
    expect(store.calls).not.toContain("run.create");
  });

  it("REFUSES when no areas are configured, and deletes nothing", async () => {
    // An empty required list means the environment has not said what it needs — never that it needs
    // nothing. One mistyped GitHub variable would otherwise clear every area in production.
    const store = makeStore([coverage("MK"), coverage("RG")]);
    const { source, decommissionAreas } = makeSource();

    const summary = await decommissionUnsupportedAreas(store.client, source, {
      areas: [],
      log: () => {},
    });

    expect(summary.status).toBe("FAILED");
    expect(summary.error).toMatch(/no postcode areas configured/i);
    expect(summary.deleted).toBe(0);
    expect(decommissionAreas).not.toHaveBeenCalled();
    expect(store.calls).toEqual([]);
    expect(store.rows).toHaveLength(2);
  });

  it("never removes a required area, even when it is covered", async () => {
    const store = makeStore([coverage("MK"), coverage("RG"), coverage("LU")]);
    const { source, decommissionAreas } = makeSource();

    await decommissionUnsupportedAreas(store.client, source, {
      areas: ["MK", "RG", "LU"],
      log: () => {},
    });

    expect(decommissionAreas).not.toHaveBeenCalled();
    expect(store.rows.map((row) => row.postcodeArea).sort()).toEqual(["LU", "MK", "RG"]);
  });

  it("normalises configured areas, so lower-case configuration does not retire everything", async () => {
    const store = makeStore([coverage("MK"), coverage("RG")]);
    const { source, decommissionAreas } = makeSource();

    const summary = await decommissionUnsupportedAreas(store.client, source, {
      areas: [" mk ", "rg"],
      log: () => {},
    });

    expect(summary.removedAreas).toEqual([]);
    expect(decommissionAreas).not.toHaveBeenCalled();
  });

  it("dry run reports what it would remove and removes nothing", async () => {
    const store = makeStore([coverage("MK"), coverage("LU", 6464)]);
    const { source, decommissionAreas } = makeSource();

    const summary = await decommissionUnsupportedAreas(store.client, source, {
      areas: ["MK"],
      dryRun: true,
      log: () => {},
    });

    expect(summary.status).toBe("SUCCEEDED");
    expect(summary.removedAreas).toEqual(["LU"]);
    expect(summary.deleted).toBe(0);
    expect(summary.dryRun).toBe(true);
    expect(decommissionAreas).not.toHaveBeenCalled();
    expect(store.rows).toHaveLength(2);
    expect(store.calls).not.toContain("run.create");
    expect(store.calls).not.toContain("dataset.update");
  });

  it("records the run and moves the activation signal", async () => {
    const store = makeStore([coverage("MK", 10), coverage("LU", 6464)]);
    const { source } = makeSource(6464);

    await decommissionUnsupportedAreas(store.client, source, { areas: ["MK"], log: () => {} });

    expect(store.runs[0]).toMatchObject({ requestedAreas: "LU", status: "RUNNING" });
    expect(store.runs[1]).toMatchObject({ status: "SUCCEEDED", retired: 6464 });
    expect(store.datasetUpdate).toMatchObject({
      recordCount: 10,
      syncStatus: "SUCCEEDED",
      cacheVersion: { increment: 1 },
    });
  });

  it("never downloads, parses or imports", async () => {
    const store = makeStore([coverage("MK"), coverage("LU")]);
    const parts = makeSource();

    await decommissionUnsupportedAreas(store.client, parts.source, {
      areas: ["MK"],
      log: () => {},
    });

    expect(parts.discoverLatest).not.toHaveBeenCalled();
    expect(parts.download).not.toHaveBeenCalled();
    expect(parts.parse).not.toHaveBeenCalled();
    expect(parts.validate).not.toHaveBeenCalled();
    expect(parts.apply).not.toHaveBeenCalled();
  });

  it("records a FAILED run when the delete throws mid-way", async () => {
    const store = makeStore([coverage("MK"), coverage("LU")]);
    const { source } = makeSource();
    const throwingSource = {
      ...source,
      decommissionAreas: async () => {
        throw new Error("connection reset");
      },
    } as unknown as ReferenceDataSource<unknown>;

    const summary = await decommissionUnsupportedAreas(store.client, throwingSource, {
      areas: ["MK"],
      log: () => {},
    });

    expect(summary.status).toBe("FAILED");
    expect(summary.error).toBe("connection reset");
    expect(store.runs.at(-1)).toMatchObject({ status: "FAILED", errorMessage: "connection reset" });
  });
});

describe("per-source deletes are area-scoped", () => {
  it("codePointSource deletes only the named areas' postcodes", async () => {
    const deleteMany = vi.fn(async () => ({ count: 6464 }));
    const client = { postcodeReference: { deleteMany } } as unknown as Db;

    const outcome = await decommissionPostcodeAreas(client, ["LU"]);

    expect(outcome.deleted).toBe(6464);
    expect(deleteMany).toHaveBeenCalledWith({ where: { postcodeArea: { in: ["LU"] } } });
  });

  it("openNamesSource deletes only the named areas' places", async () => {
    const deleteMany = vi.fn(async () => ({ count: 12 }));
    const client = { placeReference: { deleteMany } } as unknown as Db;

    const outcome = await decommissionPlaceAreas(client, ["LU"]);

    expect(outcome.deleted).toBe(12);
    expect(deleteMany).toHaveBeenCalledWith({ where: { postcodeArea: { in: ["LU"] } } });
  });

  it("issues no delete at all for an empty area list", async () => {
    // Belt and braces against the same mistake the pipeline refuses higher up: a `where` of
    // `{ in: [] }` is harmless in Postgres, but a future edit that dropped the clause would not be.
    const postcodeDelete = vi.fn(async () => ({ count: 0 }));
    const placeDelete = vi.fn(async () => ({ count: 0 }));

    await decommissionPostcodeAreas({ postcodeReference: { deleteMany: postcodeDelete } } as unknown as Db, []); // prettier-ignore
    await decommissionPlaceAreas({ placeReference: { deleteMany: placeDelete } } as unknown as Db, []); // prettier-ignore

    expect(postcodeDelete).not.toHaveBeenCalled();
    expect(placeDelete).not.toHaveBeenCalled();
  });
});
