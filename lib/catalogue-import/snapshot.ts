/**
 * #1216 R37 — a per-vendor row-count snapshot and the comparison between two of them. Pure.
 * `scripts/verify-catalogue-import.ts` takes the snapshots; this file only decides what counts as a
 * difference, so the decision can be tested without a database.
 */

export const SNAPSHOT_TABLES = [
  "Vendor",
  "VendorDomain",
  "Product",
  "Category",
  "Inventory",
  "ProductRestrictionAuditLog",
] as const;
export type SnapshotTable = (typeof SNAPSHOT_TABLES)[number];

export interface VendorSnapshot {
  slug: string;
  counts: Record<SnapshotTable, number>;
}

export interface Snapshot {
  takenAt: string;
  /** vendorId → snapshot */
  vendors: Record<string, VendorSnapshot>;
}

export interface SnapshotDifference {
  vendorId: string;
  slug: string;
  table: SnapshotTable;
  before: number;
  after: number;
}

/** Differences for every vendor EXCEPT `exceptSlug`. A vendor present in only one snapshot is a difference. */
export function diffSnapshots(a: Snapshot, b: Snapshot, exceptSlug: string): SnapshotDifference[] {
  const out: SnapshotDifference[] = [];
  const ids = new Set([...Object.keys(a.vendors), ...Object.keys(b.vendors)]);
  for (const vendorId of ids) {
    const before = a.vendors[vendorId];
    const after = b.vendors[vendorId];
    const slug = (before ?? after).slug;
    if (slug === exceptSlug) continue;
    for (const table of SNAPSHOT_TABLES) {
      const x = before?.counts[table] ?? 0;
      const y = after?.counts[table] ?? 0;
      if (x !== y) out.push({ vendorId, slug, table, before: x, after: y });
    }
  }
  return out;
}
