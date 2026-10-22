/**
 * #1211 (ADR-007 Decision 2) — the contract every catalogue import writes through. Pure: no I/O,
 * no Prisma, and NO department or vendor name in this file — which departments map to which
 * restriction is per-client import input (ADR-004), supplied by the importer (`#1201`) as a
 * `DepartmentRestrictionPolicy`.
 *
 * The three guarantees, each exhaustively tested in tests/catalogue-import-policy.test.ts:
 *   1. Every imported row is created HIDDEN with stock UNKNOWN — clean rows included.
 *   2. A re-import never activates a product, never clears or loosens a restriction, and never
 *      touches stock (it returns no stock fields at all).
 *   3. Classification takes the stricter of every signal; uncertainty means NEEDS_REVIEW.
 */
import type { ProductRestriction, StockMode } from "@/lib/cart-rules";
import { stricterOf } from "@/lib/product-restriction";

export interface DepartmentRestrictionPolicy {
  /** Source department name → restriction. Matched case- and whitespace-insensitively. */
  byDepartment: Readonly<Record<string, ProductRestriction>>;
  /** Departments whose rows cannot be trusted as products without a human look (e.g. a catch-all). */
  uncertainDepartments: readonly string[];
}

export interface ImportRowSignals {
  department: string;
  /** The row's retail price in integer pence. */
  pricePence: number;
}

/** Trim, collapse inner whitespace, upper-case: `" tobacco "` and `"TOBACCO"` are one department. */
export function normaliseDepartment(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

/** The restriction an imported row arrives with, or null when nothing flags it. */
export function classifyImportRow(
  row: ImportRowSignals,
  policy: DepartmentRestrictionPolicy,
): ProductRestriction | null {
  const department = normaliseDepartment(row.department);

  let restriction: ProductRestriction | null = null;
  for (const [name, mapped] of Object.entries(policy.byDepartment)) {
    if (normaliseDepartment(name) === department) restriction = stricterOf(restriction, mapped);
  }

  const uncertain =
    policy.uncertainDepartments.some((name) => normaliseDepartment(name) === department) ||
    !Number.isFinite(row.pricePence) ||
    row.pricePence <= 0;
  if (uncertain) restriction = stricterOf(restriction, "NEEDS_REVIEW");

  return restriction;
}

export interface NewImportedProductState {
  isActive: false;
  restriction: ProductRestriction | null;
  stockMode: StockMode;
}

/** A product being created by an import: always hidden, always UNKNOWN stock (owner ruling B). */
export function newImportedProductState(
  restriction: ProductRestriction | null,
): NewImportedProductState {
  return { isActive: false, restriction, stockMode: "UNKNOWN" };
}

export interface ExistingProductState {
  isActive: boolean;
  restriction: ProductRestriction | null;
}

export interface ReimportedProductState {
  isActive: boolean;
  restriction: ProductRestriction | null;
  /** True when the restriction got stricter — the importer writes a RESTRICTION_SET audit row. */
  tightened: boolean;
}

/**
 * What a re-import of an existing product may change. Never stock: this returns no stock field, so
 * an importer that spreads the result cannot write one.
 *
 * - `isActive` can only stay or go false. An import never switches a product on.
 * - The restriction is the stricter of existing and incoming — never cleared, never loosened.
 * - An incoming NEEDS_REVIEW is NOT applied over an unrestricted product: "uncertain at source" is
 *   a first-import signal, and the product may already have been reviewed by a person (an audited
 *   clear). Re-flagging it would silently undo that review.
 * - Any non-null resulting restriction forces `isActive: false` (the DB CHECK demands it too).
 */
export function reimportedProductState(
  existing: ExistingProductState,
  incoming: ProductRestriction | null,
): ReimportedProductState {
  const effectiveIncoming =
    incoming === "NEEDS_REVIEW" && existing.restriction === null ? null : incoming;
  const restriction = stricterOf(existing.restriction, effectiveIncoming);
  return {
    restriction,
    isActive: restriction === null ? existing.isActive : false,
    tightened: restriction !== existing.restriction,
  };
}
