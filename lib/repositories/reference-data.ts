import type { getPrisma } from "@/lib/db";

/**
 * Reference-dataset status reads (#764) — the ONLY request-path DB access for `ReferenceDataset`.
 *
 * Writes live in `lib/reference-data/sync-service.ts`, which runs on a Node runner and never in a
 * request. This module exists so the request path can answer one question cheaply: **has this
 * dataset ever been populated in this environment?**
 *
 * That question is load-bearing rather than informational. It is the difference between "this
 * postcode does not exist" and "we cannot currently tell", and getting it wrong in the permissive
 * direction turns a deployment-ordering accident into rejected checkouts. See
 * `lib/delivery-eligibility.ts` for the state model this feeds.
 *
 * Not vendor-scoped; every export takes `prisma` explicitly and reads no request context.
 */

type Db = ReturnType<typeof getPrisma>;

/** `sourceKey` of the postcode authority. Must match `codePointSource.key`. */
export const CODE_POINT_SOURCE_KEY = "code-point-open";

/** `sourceKey` of the geographic enrichment dataset. Must match `openNamesSource.key`. */
export const OPEN_NAMES_SOURCE_KEY = "os-open-names";

export interface ReferenceDatasetStatus {
  sourceKey: string;
  sourceVersion: string | null;
  recordCount: number;
  cacheVersion: number;
  lastCheckedAt: Date | null;
  lastSyncedAt: Date | null;
  syncStatus: string;
  syncError: string | null;
  /**
   * True only when this environment has completed at least one successful import.
   *
   * Derived from `lastSyncedAt`, not from whether rows happen to exist: a partially populated table
   * from an interrupted first run is not an authority, and must not be treated as one.
   */
  initialised: boolean;
}

export async function findDatasetStatus(
  prisma: Db,
  sourceKey: string,
): Promise<ReferenceDatasetStatus | null> {
  const row = await prisma.referenceDataset.findUnique({
    where: { sourceKey },
    select: {
      sourceKey: true,
      sourceVersion: true,
      recordCount: true,
      cacheVersion: true,
      lastCheckedAt: true,
      lastSyncedAt: true,
      syncStatus: true,
      syncError: true,
    },
  });

  if (!row) return null;
  return { ...row, initialised: row.lastSyncedAt !== null };
}

/** Every dataset's status, for operational reporting. Never used on the request path. */
export async function listDatasetStatuses(prisma: Db): Promise<ReferenceDatasetStatus[]> {
  const rows = await prisma.referenceDataset.findMany({
    orderBy: { sourceKey: "asc" },
    select: {
      sourceKey: true,
      sourceVersion: true,
      recordCount: true,
      cacheVersion: true,
      lastCheckedAt: true,
      lastSyncedAt: true,
      syncStatus: true,
      syncError: true,
    },
  });

  return rows.map((row) => ({ ...row, initialised: row.lastSyncedAt !== null }));
}
