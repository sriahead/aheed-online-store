import { createHash } from "node:crypto";
import { findOutstandingAreas, recordAreaCoverage } from "@/lib/repositories/reference-coverage";
import type { Db, ReferenceDataSource } from "./source";

/**
 * The generic reference-data synchronisation pipeline (#764).
 *
 * One implementation, driven by every source:
 *
 *   discover latest release -> compare version/checksum AND required coverage ->
 *   exit if neither changed -> download -> verify checksum -> parse (scoped to the areas
 *   needing work) -> validate -> apply -> record coverage -> activate -> record result
 *
 * ## THE SYNC DECISION HAS TWO INDEPENDENT DIMENSIONS
 *
 * This is the subtlety a checksum-only implementation gets wrong, silently. Work is needed when
 * **either**:
 *
 * 1. the upstream OS release changed — a new version or a new checksum; **or**
 * 2. our required coverage changed — an area is configured that is not yet materialised at the
 *    current version.
 *
 * Exiting `changed=false` because the publisher's md5 matched, while a newly configured area sits
 * unimported, would be a failure with no error and no output — the shape of bug this project keeps
 * paying for. So the decision consults `ReferenceAreaCoverage` as well as the checksum, and a run
 * imports exactly the areas that are outstanding, leaving already-current areas untouched.
 *
 * ## The guarantees this file exists to provide
 *
 * **A failed refresh never costs you the data you already had.** Nothing is deleted at any point;
 * `apply` inserts, updates and marks rows inactive, and every stage that can fail happens *before*
 * the dataset is marked current. If the download is corrupt, the schema moved, or an area's record
 * count collapsed, the previous release keeps serving and the run is recorded as FAILED with a
 * reason. This is not theoretical: the first full Open Names import died mid-write against a full
 * database, and because coverage is written only after an area completes, those partial rows were
 * never treated as an authority.
 *
 * **Coverage is written per area, only on success.** An area that fails leaves no coverage row, so
 * it stays UNVERIFIED to the reference service rather than appearing covered with missing data.
 *
 * **`cacheVersion` is the activation signal, and it moves only on success.** Untouched by a run that
 * exits unchanged, and untouched by a run that fails.
 *
 * **Retrying is always safe.** Every stage is idempotent.
 *
 * Node only — `node:crypto` and multi-megabyte buffers. See `source.ts` for why.
 */

export interface SyncOptions {
  /** The postcode areas this environment requires. */
  areas: string[];
  /** Re-import even when the publisher's release and our coverage are both unchanged. */
  force?: boolean;
  /** Where progress is reported. Defaults to `console.log`. */
  log?: (message: string) => void;
}

export interface SyncRunSummary {
  sourceKey: string;
  status: "SUCCEEDED" | "FAILED";
  version: string | null;
  changed: boolean;
  /** The areas this run actually imported. Empty when nothing was outstanding. */
  importedAreas: string[];
  inserted: number;
  updated: number;
  retired: number;
  unchanged: number;
  error: string | null;
}

function md5(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

/**
 * Ensure the dataset's own row exists, so a brand-new environment can sync without being seeded
 * first. This is what makes the bootstrap path work against a genuinely empty database.
 */
async function ensureDataset(prisma: Db, source: ReferenceDataSource<unknown>) {
  const existing = await prisma.referenceDataset.findUnique({ where: { sourceKey: source.key } });
  if (existing) return existing;

  return prisma.referenceDataset.create({
    data: {
      sourceKey: source.key,
      displayName: source.displayName,
      refreshFrequencyDays: source.refreshFrequencyDays,
    },
  });
}

export async function syncReferenceData<TRecord>(
  prisma: Db,
  source: ReferenceDataSource<TRecord>,
  options: SyncOptions,
): Promise<SyncRunSummary> {
  const log = options.log ?? ((message: string) => console.log(message));
  const areas = [...new Set(options.areas.map((area) => area.trim().toUpperCase()))].sort();
  const dataset = await ensureDataset(prisma, source as ReferenceDataSource<unknown>);

  const run = await prisma.referenceDataSyncRun.create({
    data: { datasetId: dataset.id, status: "RUNNING", requestedAreas: areas.join(",") },
    select: { id: true },
  });

  const fail = async (message: string, version: string | null): Promise<SyncRunSummary> => {
    // The dataset keeps its previous sourceVersion, sourceChecksum, recordCount, lastSyncedAt and
    // cacheVersion, and every coverage row it already had. Only the failure is recorded, so the
    // last known-good release is still exactly what it was, and still serving.
    await prisma.referenceDataset.update({
      where: { id: dataset.id },
      data: { syncStatus: "FAILED", syncError: message, lastCheckedAt: new Date() },
    });
    await prisma.referenceDataSyncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: message, finishedAt: new Date(), sourceVersion: version }, // prettier-ignore
    });
    log(`[${source.key}] FAILED: ${message}`);
    return {
      sourceKey: source.key,
      status: "FAILED",
      version,
      changed: false,
      importedAreas: [],
      inserted: 0,
      updated: 0,
      retired: 0,
      unchanged: 0,
      error: message,
    };
  };

  let version: string | null = null;

  try {
    await prisma.referenceDataset.update({
      where: { id: dataset.id },
      data: { syncStatus: "RUNNING", syncError: null },
    });

    if (areas.length === 0) {
      return fail(
        "no postcode areas configured — set UK_LOCATION_REF_POSTCODE_AREAS, or pass --areas",
        null,
      );
    }

    log(`[${source.key}] discovering latest release (required areas: ${areas.join(", ")})`);
    const release = await source.discoverLatest();
    version = release.version;

    const releaseUnchanged =
      dataset.sourceVersion === release.version && dataset.sourceChecksum === release.checksum;

    // DIMENSION TWO. Areas already materialised at THIS version need no work; anything else does,
    // whether it is newly configured or stale because the version moved.
    const outstanding = await findOutstandingAreas(prisma, source.key, areas, release.version);

    if (releaseUnchanged && outstanding.length === 0 && !options.force) {
      log(`[${source.key}] unchanged at version ${release.version}, coverage complete — nothing to do`); // prettier-ignore
      await prisma.referenceDataset.update({
        where: { id: dataset.id },
        data: { lastCheckedAt: new Date(), syncStatus: "SUCCEEDED", syncError: null },
      });
      await prisma.referenceDataSyncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          sourceVersion: release.version,
          unchanged: dataset.recordCount,
        },
      });
      return {
        sourceKey: source.key,
        status: "SUCCEEDED",
        version: release.version,
        changed: false,
        importedAreas: [],
        inserted: 0,
        updated: 0,
        retired: 0,
        unchanged: dataset.recordCount,
        error: null,
      };
    }

    // A forced run re-imports everything required; otherwise only what is outstanding.
    const toImport = options.force ? areas : outstanding;
    log(
      `[${source.key}] version ${release.version}${releaseUnchanged ? " (unchanged upstream)" : " (new release)"} — importing areas: ${toImport.join(", ")}`,
    );

    log(`[${source.key}] downloading ${release.sizeBytes} bytes`);
    const archive = await source.download(release);

    // Treat the archive as untrusted input. The checksum is the publisher's own, so a mismatch
    // means the bytes are not what was published — truncated, corrupted in transit, or swapped.
    const actual = md5(archive);
    if (actual !== release.checksum) {
      return fail(
        `checksum mismatch: published md5 ${release.checksum}, received ${actual} — refusing to parse`,
        version,
      );
    }

    log(`[${source.key}] checksum verified, parsing`);
    const records = source.parse(archive, release, toImport);

    const validation = source.validate(records, toImport);
    if (!validation.ok) return fail(validation.error, version);

    log(`[${source.key}] applying ${records.length} records`);
    const outcome = await source.apply(prisma, records, release.version, toImport);

    // COVERAGE, written per area and only now — after that area's rows are in. An area that never
    // got here has no coverage row, so the reference service keeps reporting it UNVERIFIED rather
    // than treating incomplete data as authoritative.
    for (const area of toImport) {
      await recordAreaCoverage(
        prisma,
        source.key,
        area,
        release.version,
        outcome.perArea[area] ?? 0,
      );
    }

    // ACTIVATION. Only now does the dataset claim this version, and only now does cacheVersion
    // move — every way this run could have failed is already behind us.
    const totalRecords = await countRecords(prisma, source.key);
    await prisma.referenceDataset.update({
      where: { id: dataset.id },
      data: {
        sourceVersion: release.version,
        sourceChecksum: release.checksum,
        recordCount: totalRecords,
        lastCheckedAt: new Date(),
        lastSyncedAt: new Date(),
        syncStatus: "SUCCEEDED",
        syncError: null,
        cacheVersion: { increment: 1 },
      },
    });

    await prisma.referenceDataSyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        sourceVersion: release.version,
        inserted: outcome.inserted,
        updated: outcome.updated,
        retired: outcome.retired,
        unchanged: Math.max(records.length - outcome.inserted - outcome.updated, 0),
      },
    });

    log(
      `[${source.key}] SUCCEEDED version=${release.version} areas=${toImport.join(",")} inserted=${outcome.inserted} updated=${outcome.updated} retired=${outcome.retired}`,
    );

    return {
      sourceKey: source.key,
      status: "SUCCEEDED",
      version: release.version,
      changed: true,
      importedAreas: toImport,
      inserted: outcome.inserted,
      updated: outcome.updated,
      retired: outcome.retired,
      unchanged: Math.max(records.length - outcome.inserted - outcome.updated, 0),
      error: null,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), version);
  }
}

/**
 * How many active rows the source now holds in total, across every covered area.
 *
 * Read back rather than accumulated from this run, because a run only touches the areas it
 * imported — adding `LU` must leave `recordCount` describing everything, not just `LU`.
 */
async function countRecords(prisma: Db, sourceKey: string): Promise<number> {
  const coverage = await prisma.referenceAreaCoverage.findMany({
    where: { sourceKey },
    select: { recordCount: true },
  });
  return coverage.reduce((total, row) => total + row.recordCount, 0);
}
