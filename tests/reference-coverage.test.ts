import { describe, expect, it } from "vitest";
import {
  findOutstandingAreas,
  isAreaCovered,
  listCoveredAreas,
  recordAreaCoverage,
} from "@/lib/repositories/reference-coverage";
import type { getReferencePrisma } from "@/lib/reference-db";

/**
 * Materialised postcode-area coverage (#764).
 *
 * `findOutstandingAreas` is the second of the sync's two change dimensions, and the reason a
 * newly configured area gets imported even when the publisher's checksum has not moved. Getting it
 * wrong produces a failure with no error and no output — the area simply never arrives — so it is
 * tested directly rather than only through the pipeline.
 */

interface CoverageRow {
  sourceKey: string;
  postcodeArea: string;
  sourceVersion: string;
  recordCount: number;
  materialisedAt: Date;
}

function makeClient(initial: Partial<CoverageRow>[] = []) {
  const rows: CoverageRow[] = initial.map((row) => ({
    sourceKey: "code-point-open",
    sourceVersion: "2026-08",
    recordCount: 10,
    materialisedAt: new Date(),
    postcodeArea: "MK",
    ...row,
  }));

  return {
    rows,
    client: {
      referenceAreaCoverage: {
        async findMany({
          where,
        }: {
          where: { sourceKey: string; postcodeArea?: { in: string[] }; sourceVersion?: string };
        }) {
          return rows.filter(
            (row) =>
              row.sourceKey === where.sourceKey &&
              (!where.postcodeArea || where.postcodeArea.in.includes(row.postcodeArea)) &&
              (!where.sourceVersion || row.sourceVersion === where.sourceVersion),
          );
        },
        async findUnique({
          where,
        }: {
          where: { sourceKey_postcodeArea: { sourceKey: string; postcodeArea: string } };
        }) {
          const key = where.sourceKey_postcodeArea;
          return (
            rows.find(
              (row) => row.sourceKey === key.sourceKey && row.postcodeArea === key.postcodeArea,
            ) ?? null
          );
        },
        async upsert({
          where,
          create,
          update,
        }: {
          where: { sourceKey_postcodeArea: { sourceKey: string; postcodeArea: string } };
          create: CoverageRow;
          update: Partial<CoverageRow>;
        }) {
          const key = where.sourceKey_postcodeArea;
          const found = rows.find(
            (row) => row.sourceKey === key.sourceKey && row.postcodeArea === key.postcodeArea,
          );
          if (found) Object.assign(found, update);
          else rows.push(create);
          return found ?? create;
        },
      },
    } as unknown as ReturnType<typeof getReferencePrisma>,
  };
}

describe("isAreaCovered", () => {
  it("is true for a materialised area", async () => {
    const { client } = makeClient([{ postcodeArea: "MK" }]);
    await expect(isAreaCovered(client, "code-point-open", "MK")).resolves.toBe(true);
  });

  it("is false for an area that was never imported", async () => {
    // The distinction the whole feature rests on: not having imported Edinburgh is not evidence
    // that an Edinburgh postcode does not exist.
    const { client } = makeClient([{ postcodeArea: "MK" }]);
    await expect(isAreaCovered(client, "code-point-open", "EH")).resolves.toBe(false);
  });

  it("does not leak coverage between sources", async () => {
    const { client } = makeClient([{ postcodeArea: "MK", sourceKey: "os-open-names" }]);
    await expect(isAreaCovered(client, "code-point-open", "MK")).resolves.toBe(false);
  });
});

describe("findOutstandingAreas", () => {
  it("returns nothing when every required area is current", async () => {
    const { client } = makeClient([{ postcodeArea: "MK" }, { postcodeArea: "RG" }]);

    const outstanding = await findOutstandingAreas(
      client,
      "code-point-open",
      ["MK", "RG"],
      "2026-08",
    );

    expect(outstanding).toEqual([]);
  });

  it("returns a newly required area even when the version is unchanged", async () => {
    // THE case a checksum-only sync gets wrong. LU is configured, the publisher has not moved, and
    // the area has no data — so work is required despite an identical md5.
    const { client } = makeClient([{ postcodeArea: "MK" }, { postcodeArea: "RG" }]);

    const outstanding = await findOutstandingAreas(
      client,
      "code-point-open",
      ["MK", "RG", "LU"],
      "2026-08",
    );

    expect(outstanding).toEqual(["LU"]);
  });

  it("returns every area when the upstream version moves", async () => {
    // A new release makes all existing coverage stale, which falls out of matching on version
    // rather than needing its own branch.
    const { client } = makeClient([{ postcodeArea: "MK" }, { postcodeArea: "RG" }]);

    const outstanding = await findOutstandingAreas(
      client,
      "code-point-open",
      ["MK", "RG"],
      "2026-09",
    );

    expect(outstanding).toEqual(["MK", "RG"]);
  });

  it("returns everything against an empty coverage table", async () => {
    const { client } = makeClient();

    const outstanding = await findOutstandingAreas(client, "code-point-open", ["MK"], "2026-08");

    expect(outstanding).toEqual(["MK"]);
  });

  it("returns nothing when nothing is required, rather than treating that as 'everything'", async () => {
    const { client } = makeClient();
    await expect(findOutstandingAreas(client, "code-point-open", [], "2026-08")).resolves.toEqual(
      [],
    );
  });

  it("preserves the caller's ordering of required areas", async () => {
    const { client } = makeClient();

    const outstanding = await findOutstandingAreas(
      client,
      "code-point-open",
      ["RG", "LU", "MK"],
      "2026-08",
    );

    expect(outstanding).toEqual(["RG", "LU", "MK"]);
  });
});

describe("recordAreaCoverage", () => {
  it("creates a row for a newly materialised area", async () => {
    const store = makeClient();

    await recordAreaCoverage(store.client, "code-point-open", "MK", "2026-08", 1234);

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ postcodeArea: "MK", recordCount: 1234 });
  });

  it("moves an existing area forward to a new version rather than failing", async () => {
    const store = makeClient([{ postcodeArea: "MK", sourceVersion: "2026-08", recordCount: 10 }]);

    await recordAreaCoverage(store.client, "code-point-open", "MK", "2026-09", 99);

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ sourceVersion: "2026-09", recordCount: 99 });
  });
});

describe("listCoveredAreas", () => {
  it("lists only the given source's areas", async () => {
    const { client } = makeClient([
      { postcodeArea: "MK" },
      { postcodeArea: "RG" },
      { postcodeArea: "LU", sourceKey: "os-open-names" },
    ]);

    const covered = await listCoveredAreas(client, "code-point-open");

    expect(covered.map((row) => row.postcodeArea).sort()).toEqual(["MK", "RG"]);
  });
});
