import { getRequiredPostcodeAreas } from "@/lib/config";
import { getReferencePrisma, isReferenceDatabaseConfigured } from "@/lib/reference-db";
import { listCoveredAreas } from "@/lib/repositories/reference-coverage";
import { listDatasetStatuses } from "@/lib/repositories/reference-data";

/**
 * Operational status of the reference database (#771).
 *
 * ## Why this exists
 *
 * Every other part of this feature is designed to fail quietly, and correctly so: an unconfigured,
 * unreachable or unsynced reference database degrades to UNVERIFIED, which the address surfaces
 * render as manual entry rather than as an error. That is the right behaviour for a customer and a
 * terrible property for an operator — a healthy environment and a completely broken one produce the
 * same page, and nothing logs, because the guard returns before any query is attempted.
 *
 * Two real failures hid in exactly that silence. `LU` sat materialised while configuration said
 * `MK,RG`, so the platform claimed authority over an area no run would ever refresh; and staging
 * answered UNVERIFIED for every postcode for a day because its deployed Worker version carried no
 * reference binding, while `wrangler secret list` cheerfully listed the secret. Neither is visible
 * to `lint`, `typecheck`, `test` or `build`, and neither shows up in a single request's response.
 *
 * So this reports the two things that distinguish those cases from health: whether the binding is
 * present at all, and whether what is materialised matches what is configured — **in both
 * directions**. Required-but-not-covered means a sync has not run; covered-but-not-required means
 * an area is being vouched for that nothing maintains.
 *
 * ## Never fatal, and never on a hot path
 *
 * `/api/health` is the only caller. Reference state must never change that endpoint's verdict:
 * `lib/config.ts` deliberately declines to make these variables required-in-production because an
 * absent reference database is a recoverable, designed state, and turning a provisioning gap into a
 * red health check would invert that decision. This module therefore reports and never throws.
 *
 * It lives under `lib/reference/` because that is the service boundary: `app/` may not touch the
 * reference client, the reference schema, or any reference table (`specs/architecture.md` §3.0,
 * rule 1). `listDatasetStatuses` and `listCoveredAreas` already existed for operational reporting
 * and are reused rather than reimplemented.
 */

export interface ReferenceSourceStatus {
  sourceKey: string;
  sourceVersion: string | null;
  syncStatus: string;
  lastSyncedAt: string | null;
  recordCount: number;
  /** Areas materialised for this source, alphabetically. */
  coveredAreas: string[];
  /** Configured but not materialised — a sync is owed. */
  missingAreas: string[];
  /** Materialised but not configured — nothing will ever refresh these. */
  unsupportedAreas: string[];
}

export interface ReferenceStatus {
  /** Whether this environment has a reference database URL at all. */
  configured: boolean;
  /** Whether the database answered. False when unconfigured, unreachable, or not yet migrated. */
  reachable: boolean;
  requiredAreas: string[];
  sources: ReferenceSourceStatus[];
  /** True when any source has a missing or unsupported area. */
  drift: boolean;
}

function emptyStatus(configured: boolean, requiredAreas: string[]): ReferenceStatus {
  return { configured, reachable: false, requiredAreas, sources: [], drift: false };
}

/**
 * Read the reference database's coverage and dataset state.
 *
 * Resolves in every failure mode — unconfigured, unreachable, schema absent — and throws in none.
 * A caller rendering this into a health response must be able to do so unconditionally.
 */
export async function getReferenceStatus(): Promise<ReferenceStatus> {
  // Read before the configured check so an environment with no reference database still reports
  // what it *expects*, which is what makes "configured: false" actionable rather than merely true.
  let requiredAreas: string[] = [];
  try {
    requiredAreas = getRequiredPostcodeAreas();
  } catch {
    requiredAreas = [];
  }

  if (!isReferenceDatabaseConfigured()) return emptyStatus(false, requiredAreas);

  try {
    const prisma = getReferencePrisma();
    const datasets = await listDatasetStatuses(prisma);

    const sources: ReferenceSourceStatus[] = [];
    for (const dataset of datasets) {
      const coveredAreas = (await listCoveredAreas(prisma, dataset.sourceKey)).map(
        (row) => row.postcodeArea,
      );
      sources.push({
        sourceKey: dataset.sourceKey,
        sourceVersion: dataset.sourceVersion,
        syncStatus: dataset.syncStatus,
        lastSyncedAt: dataset.lastSyncedAt?.toISOString() ?? null,
        recordCount: dataset.recordCount,
        coveredAreas,
        missingAreas: requiredAreas.filter((area) => !coveredAreas.includes(area)),
        unsupportedAreas: coveredAreas.filter((area) => !requiredAreas.includes(area)),
      });
    }

    return {
      configured: true,
      reachable: true,
      requiredAreas,
      sources,
      drift: sources.some(
        (source) => source.missingAreas.length > 0 || source.unsupportedAreas.length > 0,
      ),
    };
  } catch (error) {
    // Reachability is information, not a failure: an environment mid-provisioning is expected to
    // land here. Logged because, unlike a postcode lookup, nothing downstream will surface it.
    console.error(
      `reference status unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return emptyStatus(true, requiredAreas);
  }
}
