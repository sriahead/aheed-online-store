import { createHash } from "node:crypto";
import type { Db, ReferenceDataSource } from "./source";

/**
 * The generic reference-data synchronisation pipeline (#764).
 *
 * One implementation, driven by every source:
 *
 *   discover latest release -> compare version/checksum -> exit if unchanged -> download ->
 *   verify checksum -> parse -> validate -> apply -> activate -> record result
 *
 * ## The guarantees this file exists to provide
 *
 * **A failed refresh never costs you the data you already had.** Nothing is deleted at any point;
 * `apply` inserts, updates and marks rows inactive, and every stage that can fail happens *before*
 * the dataset is marked current. If the download is corrupt, the schema moved, or the record count
 * collapsed, the previous release keeps serving and the run is recorded as FAILED with a reason.
 * This is the "build then swap, never delete then rebuild" rule made concrete.
 *
 * **`cacheVersion` is the activation signal, and it moves only on success.** It is not touched by a
 * run that exits unchanged, and not touched by a run that fails. A reader comparing it can trust
 * that a change means a complete new dataset landed.
 *
 * **Unchanged is cheap and is still recorded.** When the publisher's version and checksum both
 * match what is stored, nothing is downloaded and no reference row is written — but `lastCheckedAt`
 * moves and a `ReferenceDataSyncRun` is still written, because "the schedule fired and there was
 * nothing to do" and "the schedule did not fire" must be distinguishable after the fact.
 *
 * **Retrying is always safe.** Every stage is idempotent: the same release applied twice inserts
 * nothing the second time, which `tests/reference-sync-integrity.test.ts` asserts directly.
 *
 * Node only — `node:crypto` and multi-megabyte buffers. See `source.ts` for why.
 */

export interface SyncOptions {
  /** Re-import even when the publisher's version and checksum are unchanged. */
  force?: boolean;
  /** Where progress is reported. Defaults to `console.log`. */
  log?: (message: string) => void;
}

export interface SyncRunSummary {
  sourceKey: string;
  status: "SUCCEEDED" | "FAILED";
  version: string | null;
  changed: boolean;
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
  options: SyncOptions = {},
): Promise<SyncRunSummary> {
  const log = options.log ?? ((message: string) => console.log(message));
  const dataset = await ensureDataset(prisma, source as ReferenceDataSource<unknown>);

  const run = await prisma.referenceDataSyncRun.create({
    data: { datasetId: dataset.id, status: "RUNNING" },
    select: { id: true },
  });

  const fail = async (message: string, version: string | null): Promise<SyncRunSummary> => {
    // The dataset keeps its previous sourceVersion, sourceChecksum, recordCount, lastSyncedAt and
    // cacheVersion. Only the failure itself is recorded, so the last known-good release is still
    // exactly what it was, and still serving.
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

    log(`[${source.key}] discovering latest release`);
    const release = await source.discoverLatest();
    version = release.version;

    const unchanged =
      dataset.sourceVersion === release.version && dataset.sourceChecksum === release.checksum;

    if (unchanged && !options.force) {
      // The whole point of the change-detection pair: nothing is downloaded, nothing is parsed,
      // and no reference row is touched.
      log(`[${source.key}] unchanged at version ${release.version} — nothing to do`);
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
        inserted: 0,
        updated: 0,
        retired: 0,
        unchanged: dataset.recordCount,
        error: null,
      };
    }

    log(`[${source.key}] downloading ${release.sizeBytes} bytes for version ${release.version}`);
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
    const records = source.parse(archive, release);

    const validation = source.validate(records);
    if (!validation.ok) return fail(validation.error, version);

    log(`[${source.key}] applying ${records.length} records`);
    const outcome = await source.apply(prisma, records, release.version);

    // ACTIVATION. Only now does the dataset claim this version, and only now does cacheVersion
    // move — every way this run could have failed is already behind us.
    await prisma.referenceDataset.update({
      where: { id: dataset.id },
      data: {
        sourceVersion: release.version,
        sourceChecksum: release.checksum,
        recordCount: records.length,
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
        unchanged: records.length - outcome.inserted - outcome.updated,
      },
    });

    log(
      `[${source.key}] SUCCEEDED version=${release.version} inserted=${outcome.inserted} updated=${outcome.updated} retired=${outcome.retired}`,
    );

    return {
      sourceKey: source.key,
      status: "SUCCEEDED",
      version: release.version,
      changed: true,
      inserted: outcome.inserted,
      updated: outcome.updated,
      retired: outcome.retired,
      unchanged: records.length - outcome.inserted - outcome.updated,
      error: null,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), version);
  }
}
