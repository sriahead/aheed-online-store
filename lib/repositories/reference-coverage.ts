import type { getReferencePrisma } from "@/lib/reference-db";

/**
 * Materialised postcode-area coverage (#764) — the ONLY DB access for `ReferenceAreaCoverage`.
 *
 * ## Why this table decides the most important distinction in the feature
 *
 * Coverage is demand-driven: the reference database is UK-wide capable but holds only the postcode
 * areas an environment has actually asked for. That makes "we have no row for this postcode" an
 * ambiguous observation on its own — it could mean the postcode does not exist, or it could mean we
 * have never imported that part of the country.
 *
 * Those two must never be conflated. Reporting a real Edinburgh postcode as INVALID because Aheed
 * only imported `MK` and `RG` would tell a customer their own address is wrong, which is both false
 * and the expensive direction to be wrong in. So:
 *
 * - area materialised + no active row  -> **INVALID** (authoritative absence)
 * - area not materialised              -> **UNVERIFIED** (we cannot tell)
 *
 * A row here exists only after that area's import has COMPLETED. A partially written area leaves no
 * row, so an interrupted import can never make an area look covered while its data is incomplete —
 * which is not hypothetical: the first full Open Names attempt died mid-write, and the absence of a
 * coverage row is exactly what stopped those 40,000 orphaned rows from being treated as an
 * authority.
 *
 * Every export takes `prisma` explicitly and reads no request context, so a plain `tsx` script can
 * exercise it. Not vendor-scoped — coverage is a property of the platform's reference data, not of
 * any tenant.
 */

type Db = ReturnType<typeof getReferencePrisma>;

export interface AreaCoverageRow {
  postcodeArea: string;
  sourceVersion: string;
  recordCount: number;
  materialisedAt: Date;
}

/** Every area materialised for a source, alphabetically. */
export async function listCoveredAreas(prisma: Db, sourceKey: string): Promise<AreaCoverageRow[]> {
  return prisma.referenceAreaCoverage.findMany({
    where: { sourceKey },
    orderBy: { postcodeArea: "asc" },
    select: { postcodeArea: true, sourceVersion: true, recordCount: true, materialisedAt: true },
  });
}

/**
 * Whether one postcode area is currently materialised for a source.
 *
 * The single question the request path asks of this table, and the reason it is indexed on
 * `[sourceKey, postcodeArea]`.
 */
export async function isAreaCovered(
  prisma: Db,
  sourceKey: string,
  postcodeArea: string,
): Promise<boolean> {
  const row = await prisma.referenceAreaCoverage.findUnique({
    where: { sourceKey_postcodeArea: { sourceKey, postcodeArea } },
    select: { postcodeArea: true },
  });
  return row !== null;
}

/**
 * Which of the required areas still need importing for a given upstream version.
 *
 * This is the **second change dimension** of the sync decision, and the one an implementation
 * checking only the publisher's checksum would miss entirely. An area is outstanding when it has no
 * coverage row at all, or when its row was materialised from an older release than the one now
 * being offered — a new upstream version makes every area stale, which is how a version bump forces
 * a re-import without any special-casing.
 */
export async function findOutstandingAreas(
  prisma: Db,
  sourceKey: string,
  requiredAreas: string[],
  sourceVersion: string,
): Promise<string[]> {
  if (requiredAreas.length === 0) return [];

  const current = await prisma.referenceAreaCoverage.findMany({
    where: { sourceKey, postcodeArea: { in: requiredAreas }, sourceVersion },
    select: { postcodeArea: true },
  });

  const covered = new Set(current.map((row) => row.postcodeArea));
  return requiredAreas.filter((area) => !covered.has(area));
}

/**
 * Record that an area is now materialised, replacing any previous record for it.
 *
 * Called ONLY after that area's rows are written. `upsert` rather than `create` because re-importing
 * an area at a new version must move it forward rather than fail on the unique constraint — and
 * `upsert` is safe on the HTTP adapter, unlike `createMany`/`updateMany` (#382).
 */
export async function recordAreaCoverage(
  prisma: Db,
  sourceKey: string,
  postcodeArea: string,
  sourceVersion: string,
  recordCount: number,
): Promise<void> {
  await prisma.referenceAreaCoverage.upsert({
    where: { sourceKey_postcodeArea: { sourceKey, postcodeArea } },
    create: { sourceKey, postcodeArea, sourceVersion, recordCount, materialisedAt: new Date() },
    update: { sourceVersion, recordCount, materialisedAt: new Date() },
  });
}
