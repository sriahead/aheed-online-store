import type { ProductRestriction } from "@/lib/cart-rules";
import type { ApplyResult } from "./apply";
import type { ImportPlan, RejectCode } from "./plan";

/**
 * #1216 R20, R26, R27 — the report, the exit code, and the isolation comparison. Pure.
 *
 * VAT AND THE CLIENT'S OTHER CELLS ARE REPORTED, NEVER REWRITTEN. `Product` has no VAT column and
 * this slice adds none, so the VAT summary exists only here, in a file the client receives anyway.
 */

export interface ReadSummary {
  rowsRead: number;
  discardedAboveHeader: number;
  discardedFooter: number;
}

export interface ImportReport {
  mode: "dry-run" | "apply";
  vendor: string;
  generatedAt: string;
  totals: {
    rowsRead: number;
    discardedAboveHeader: number;
    discardedFooter: number;
    rejected: number;
    rejectedByCode: Partial<Record<RejectCode, number>>;
    planned: number;
    /** Null in a dry run: nothing was compared with the database. */
    created: number | null;
    existingUnchanged: number | null;
    restrictionTightened: number | null;
    failed: number | null;
  };
  rejected: ImportPlan["rejected"];
  restrictionCounts: Record<ProductRestriction, number>;
  unreviewedDepartments: ImportPlan["unreviewedDepartments"];
  categoryPlan: { name: string; parent: string | null; slug: string }[];
  flattenedSubDepartments: ImportPlan["flattenedSubDepartments"];
  categoryNameVariants: ImportPlan["categoryNameVariants"];
  drift: ApplyResult["drift"];
  vat: ImportPlan["vat"];
  trace: { sourceRow: number; slug: string; productId: string | null }[];
  departments: ApplyResult["departments"];
  isolation: { checked: boolean; ok: boolean | null; differences: CountDifference[] };
}

export function buildReport(args: {
  mode: "dry-run" | "apply";
  vendor: string;
  now: Date;
  read: ReadSummary;
  plan: ImportPlan;
  applied?: ApplyResult;
  isolation?: { ok: boolean; differences: CountDifference[] };
}): ImportReport {
  const { plan, applied } = args;
  const rejectedByCode: Partial<Record<RejectCode, number>> = {};
  for (const r of plan.rejected) rejectedByCode[r.code] = (rejectedByCode[r.code] ?? 0) + 1;
  const parentName = new Map(plan.categories.map((c) => [c.slug, c.name]));

  return {
    mode: args.mode,
    vendor: args.vendor,
    generatedAt: args.now.toISOString(),
    totals: {
      rowsRead: args.read.rowsRead,
      discardedAboveHeader: args.read.discardedAboveHeader,
      discardedFooter: args.read.discardedFooter,
      rejected: plan.rejected.length,
      rejectedByCode,
      planned: plan.products.length,
      created: applied ? applied.productsCreated : null,
      existingUnchanged: applied ? applied.existingUnchanged : null,
      restrictionTightened: applied ? applied.restrictionTightened : null,
      failed: applied ? applied.failedDepartments : null,
    },
    rejected: plan.rejected,
    restrictionCounts: plan.restrictionCounts,
    unreviewedDepartments: plan.unreviewedDepartments,
    categoryPlan: plan.categories.map((c) => ({
      name: c.name,
      parent: c.parentSlug === null ? null : (parentName.get(c.parentSlug) ?? null),
      slug: c.slug,
    })),
    flattenedSubDepartments: plan.flattenedSubDepartments,
    categoryNameVariants: plan.categoryNameVariants,
    drift: applied ? applied.drift : [],
    vat: plan.vat,
    trace: applied
      ? applied.trace
      : plan.products.map((p) => ({ sourceRow: p.sourceRow, slug: p.slug, productId: null })),
    departments: applied ? applied.departments : [],
    isolation: args.isolation
      ? { checked: true, ok: args.isolation.ok, differences: args.isolation.differences }
      : { checked: false, ok: null, differences: [] },
  };
}

/**
 * 1 when any write failed; 2 when nothing failed but something needs a person (a rejected row, or a
 * category spelling variant that was reported instead of merged silently); 0 otherwise.
 */
export function exitCodeFor(
  report: Pick<ImportReport, "totals" | "categoryNameVariants">,
): 0 | 1 | 2 {
  if ((report.totals.failed ?? 0) > 0) return 1;
  if (report.totals.rejected > 0 || report.categoryNameVariants.length > 0) return 2;
  return 0;
}

// ---- isolation (R27) -------------------------------------------------------------------------

export const COUNTED_TABLES = [
  "Product",
  "Category",
  "Inventory",
  "ProductRestrictionAuditLog",
] as const;
export type CountedTable = (typeof COUNTED_TABLES)[number];

/** vendorId → table → row count. */
export type VendorCounts = Record<string, Record<CountedTable, number>>;

export interface CountDifference {
  vendorId: string;
  table: CountedTable;
  before: number;
  after: number;
}

/** Every vendor except the target must be exactly as it was. A vendor that appears or vanishes is a difference. */
export function compareVendorCounts(
  before: VendorCounts,
  after: VendorCounts,
  targetVendorId: string,
): { ok: boolean; differences: CountDifference[] } {
  const differences: CountDifference[] = [];
  const vendors = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const vendorId of vendors) {
    if (vendorId === targetVendorId) continue;
    for (const table of COUNTED_TABLES) {
      const b = before[vendorId]?.[table] ?? 0;
      const a = after[vendorId]?.[table] ?? 0;
      if (a !== b) differences.push({ vendorId, table, before: b, after: a });
    }
  }
  return { ok: differences.length === 0, differences };
}

export interface CountDb {
  product: { groupBy(args: { by: ["vendorId"]; _count: { _all: true } }): Promise<GroupRow[]> };
  category: { groupBy(args: { by: ["vendorId"]; _count: { _all: true } }): Promise<GroupRow[]> };
  inventory: { groupBy(args: { by: ["vendorId"]; _count: { _all: true } }): Promise<GroupRow[]> };
  productRestrictionAuditLog: {
    groupBy(args: { by: ["vendorId"]; _count: { _all: true } }): Promise<GroupRow[]>;
  };
}
type GroupRow = { vendorId: string; _count: { _all: number } };

/** Row counts per vendor for the four tables an import can write. Read-only. */
export async function countByVendor(db: CountDb): Promise<VendorCounts> {
  const sources: [CountedTable, () => Promise<GroupRow[]>][] = [
    ["Product", () => db.product.groupBy({ by: ["vendorId"], _count: { _all: true } })],
    ["Category", () => db.category.groupBy({ by: ["vendorId"], _count: { _all: true } })],
    ["Inventory", () => db.inventory.groupBy({ by: ["vendorId"], _count: { _all: true } })],
    [
      "ProductRestrictionAuditLog",
      () => db.productRestrictionAuditLog.groupBy({ by: ["vendorId"], _count: { _all: true } }),
    ],
  ];
  const counts: VendorCounts = {};
  for (const [table, read] of sources) {
    for (const row of await read()) {
      counts[row.vendorId] ??= {
        Product: 0,
        Category: 0,
        Inventory: 0,
        ProductRestrictionAuditLog: 0,
      };
      counts[row.vendorId][table] = row._count._all;
    }
  }
  return counts;
}
