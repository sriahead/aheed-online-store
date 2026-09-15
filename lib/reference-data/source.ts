import type { getReferencePrisma } from "@/lib/reference-db";

/**
 * The generic reference-data source contract (#764).
 *
 * ## What this abstraction is for
 *
 * Every reference dataset this application imports follows the same shape: ask the publisher what
 * the current release is, work out what we still need, stop if there is nothing to do, and otherwise
 * download, verify, parse, validate and apply. Only the middle — what the bytes mean — differs per
 * dataset. This interface is that division.
 *
 * It ships with **two real implementations**, `sources/code-point.ts` and `sources/open-names.ts`,
 * which is what makes it an abstraction over observed commonality rather than a guess about future
 * needs.
 *
 * ## Coverage is a parameter, not a property of any source
 *
 * Every stage that touches data takes the list of postcode **areas** being materialised. No source,
 * repository, schema or service contains an area literal; the list comes from configuration
 * (`REFERENCE_POSTCODE_AREAS`) and flows through as data. That is what makes adding an area a
 * configuration change rather than a code change — the requirement this contract exists to hold.
 *
 * ## Node only — deliberately
 *
 * Nothing under `lib/reference-data/` is reachable from the request path, and it must stay that way.
 * `sync-service.ts` uses `node:crypto` and the sources decompress multi-megabyte archives; neither
 * belongs in a 128 MB Worker isolate. The only entry point is `scripts/sync-reference-data.ts`,
 * running on a Node runner with its own client built from the generated reference client's **Node**
 * entry point.
 *
 * The `Db` type below is imported **type-only**, so it is erased at runtime and creates no
 * dependency on the `/wasm` build, which Node cannot load. The client is always passed in.
 */

/** Structurally the reference Prisma client; supplied by the caller, never resolved here. */
export type Db = ReturnType<typeof getReferencePrisma>;

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

/** What an import actually changed, and which areas it completed. */
export interface ApplyOutcome {
  inserted: number;
  updated: number;
  retired: number;
  /** Rows materialised per area, used to write coverage only for areas that finished. */
  perArea: Record<string, number>;
}

/**
 * One importable reference dataset.
 *
 * The stages are separate methods rather than one `sync()` so that each can be exercised on its
 * own: `parse` and `validate` are pure over bytes and records respectively, which is what lets
 * `tests/reference-sync-integrity.test.ts` prove the schema and record-count invariants, the
 * checksum refusal, area-scoped retirement and the coverage rules without a database or a network.
 */
export interface ReferenceDataSource<TRecord = unknown> {
  /** Stable identifier, also the `ReferenceDataset.sourceKey` value. */
  readonly key: string;
  /** Human-readable name for logs and the dataset row. */
  readonly displayName: string;
  /** How often a scheduled check should run. */
  readonly refreshFrequencyDays: number;
  /**
   * The smallest plausible record count **for a single postcode area**.
   *
   * Per-area rather than per-dataset because a demand-driven import legitimately parses a tiny
   * fraction of what a full-GB one would; a whole-dataset floor would either be meaninglessly low
   * or reject every normal run.
   */
  readonly minimumRecordsPerArea: number;

  /** Ask the publisher what the current release is. Must send no credential. */
  discoverLatest(): Promise<DiscoveredRelease>;

  /** Fetch the archive bytes. */
  download(release: DiscoveredRelease): Promise<Uint8Array>;

  /**
   * Turn archive bytes into records for the given postcode areas only.
   *
   * Throws if the archive is structurally unusable — a missing required column must abort the run
   * rather than silently import nulls.
   */
  parse(archive: Uint8Array, release: DiscoveredRelease, areas: string[]): TRecord[];

  /** Check the parsed records before anything is written. Returns, never throws, on bad data. */
  validate(records: TRecord[], areas: string[]): ValidationOutcome;

  /**
   * Write the records for the given areas, marking anything no longer present **within those
   * areas** as inactive rather than deleting it.
   *
   * Scoping retirement to the areas being imported is what stops an `LU` import from retiring every
   * `MK` row simply because they were not part of that pass.
   */
  apply(prisma: Db, records: TRecord[], version: string, areas: string[]): Promise<ApplyOutcome>;
}
