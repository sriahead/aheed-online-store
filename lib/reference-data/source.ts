import type { getPrisma } from "@/lib/db";

/**
 * The generic reference-data source contract (#764).
 *
 * ## What this abstraction is for
 *
 * Every reference dataset this application imports follows the same shape: ask the publisher what
 * the current release is, compare it to what we already hold, stop if nothing changed, and
 * otherwise download, verify, validate, transform and apply. Only the middle — what the bytes mean
 * — differs per dataset. This interface is that division.
 *
 * It ships with **two real implementations**, `sources/code-point.ts` and `sources/open-names.ts`,
 * which is what makes it an abstraction over observed commonality rather than a guess about future
 * needs. Both happen to be OS OpenData products reachable on the same unauthenticated endpoint, so
 * `discoverLatest` looks similar for each today; a future source with a different discovery
 * mechanism satisfies the same contract without any caller changing.
 *
 * ## Node only — deliberately
 *
 * Nothing under `lib/reference-data/` is reachable from the request path, and it must stay that
 * way. `sync-service.ts` uses `node:crypto` for checksum verification and the sources decompress
 * multi-megabyte archives; neither belongs in a 128 MB Worker isolate, and the application Worker
 * has no reason to ever import this. The only entry point is
 * `scripts/sync-reference-data.ts`, which runs on a Node runner with its own Prisma client built
 * from the bare `@prisma/client` specifier.
 *
 * The `Db` type below is imported **type-only**, so it is erased at runtime and creates no
 * dependency on `@prisma/client/wasm`, which Node cannot load. The client is always passed in.
 */

/** Structurally the Prisma client; supplied by the caller, never resolved here. */
export type Db = ReturnType<typeof getPrisma>;

/** What the publisher currently offers. */
export interface DiscoveredRelease {
  /** The publisher's own version identifier, e.g. `"2026-08"`. */
  version: string;
  /** A checksum published alongside the download, used to verify the bytes we receive. */
  checksum: string;
  /** Where to fetch the archive. */
  downloadUrl: string;
  /** Expected size in bytes, used as a cheap sanity check before decompressing. */
  sizeBytes: number;
}

/** The outcome of validating a parsed dataset, before anything is written. */
export type ValidationOutcome = { ok: true } | { ok: false; error: string };

/** What an import actually changed. */
export interface ApplyOutcome {
  inserted: number;
  updated: number;
  retired: number;
}

/**
 * One importable reference dataset.
 *
 * The stages are separate methods rather than one `sync()` so that each can be exercised on its
 * own: `parse` and `validate` are pure over bytes and records respectively, which is what lets
 * `tests/reference-sync-integrity.test.ts` prove the schema and record-count invariants, the
 * checksum refusal and the retire-not-delete rule without a database or a network.
 */
export interface ReferenceDataSource<TRecord = unknown> {
  /** Stable identifier, also the `ReferenceDataset.sourceKey` value. */
  readonly key: string;
  /** Human-readable name for logs and the dataset row. */
  readonly displayName: string;
  /** How often a scheduled check should run. */
  readonly refreshFrequencyDays: number;
  /**
   * The smallest record count a healthy release can have. A dataset that parses to fewer than this
   * is treated as damaged rather than as a real shrink — the alternative is quietly replacing a
   * complete dataset with a truncated one.
   */
  readonly minimumRecordCount: number;

  /** Ask the publisher what the current release is. Must send no credential. */
  discoverLatest(): Promise<DiscoveredRelease>;

  /** Fetch the archive bytes. */
  download(release: DiscoveredRelease): Promise<Uint8Array>;

  /** Turn archive bytes into records. Throws if the archive is structurally unusable. */
  parse(archive: Uint8Array, release: DiscoveredRelease): TRecord[];

  /** Check the parsed records before anything is written. Returns, never throws, on bad data. */
  validate(records: TRecord[]): ValidationOutcome;

  /**
   * Write the records, marking anything no longer present as inactive rather than deleting it.
   *
   * Takes `prisma` explicitly for the same reason every `lib/repositories/*` export does: a
   * function that resolves its own client cannot be run outside a Workers request, and this one
   * only ever runs outside a Workers request.
   */
  apply(prisma: Db, records: TRecord[], version: string): Promise<ApplyOutcome>;
}
