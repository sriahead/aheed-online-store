/**
 * #1211 (ADR-007 Decision 3) — the restriction rules. Pure: no I/O, no Prisma import, no
 * "use server", so it is unit-testable exhaustively and its constants can be imported anywhere.
 *
 * EVERY path that can switch a product on asks `decideEnable` — the product form, the inventory
 * toggle, the clear-and-enable control and each row of a bulk action — so a bulk action can never
 * do what a single update could not. Below this, the repository refuses `isActive = true` on a
 * restricted product for every caller, and Postgres refuses it again
 * (CHECK "Product_restricted_inactive_check"). Three layers, so a missed call site fails closed.
 *
 * The table these functions implement is `specs/2026-10-22-catalogue-restrictions-stock-states/
 * plan.md` "Hard block versus admin override". Change one, change both.
 */
import type { ProductRestriction, StockMode } from "@/lib/cart-rules";

export type { ProductRestriction } from "@/lib/cart-rules";

/** The two roles the rules distinguish. A platform admin acts as ADMIN. */
export type RestrictionActor = "STAFF" | "ADMIN";

/** `requireVendorRole`'s `via` → the actor the rules see. */
export function actorFromVia(via: "STAFF" | "ADMIN" | "platform-admin"): RestrictionActor {
  return via === "STAFF" ? "STAFF" : "ADMIN";
}

/** Every restriction, most severe first. The order is load-bearing (see `severity`). */
export const PRODUCT_RESTRICTIONS: readonly ProductRestriction[] = [
  "PROHIBITED",
  "AGE_RESTRICTED",
  "NOT_DELIVERABLE",
  "NEEDS_REVIEW",
];

export function isProductRestriction(value: unknown): value is ProductRestriction {
  return typeof value === "string" && (PRODUCT_RESTRICTIONS as readonly string[]).includes(value);
}

/** Higher is stricter; `null` (unrestricted) is 0. */
export function severity(restriction: ProductRestriction | null): number {
  switch (restriction) {
    case "PROHIBITED":
      return 4;
    case "AGE_RESTRICTED":
      return 3;
    case "NOT_DELIVERABLE":
      return 2;
    case "NEEDS_REVIEW":
      return 1;
    default:
      return 0;
  }
}

/** The stricter of two restrictions (either may be null). */
export function stricterOf(
  a: ProductRestriction | null,
  b: ProductRestriction | null,
): ProductRestriction | null {
  return severity(b) > severity(a) ? b : a;
}

/**
 * Hard blocks: no role, no confirmation and no path in the application enables these, until the
 * compliance controls `#1200` option 2 describes exist (ADR-007).
 */
export function isHardBlock(restriction: ProductRestriction | null): boolean {
  return restriction === "PROHIBITED" || restriction === "AGE_RESTRICTED";
}

/** Shopper-neutral labels for staff screens. */
export const RESTRICTION_LABELS: Record<ProductRestriction, string> = {
  PROHIBITED: "Prohibited — cannot be sold",
  AGE_RESTRICTED: "Age-restricted — cannot be sold online yet",
  NOT_DELIVERABLE: "Not deliverable",
  NEEDS_REVIEW: "Needs review",
};

export const STOCK_MODE_LABELS: Record<StockMode, string> = {
  TRACKED: "Tracked",
  UNTRACKED: "Not tracked",
  UNKNOWN: "Unknown — not for sale",
};

/** The statement an ADMIN ticks before a restricted product is enabled (plan.md). */
export const ENABLE_CONFIRMATION_TEXT =
  "I confirm this product is legally sellable by this store and can be fulfilled by its delivery or collection service.";

/** Longest reason stored on an audit row. */
export const MAX_RESTRICTION_REASON_LENGTH = 500;

/** The refusal message every write path returns for an enable on a restricted product. */
export function restrictedEnableError(restriction: ProductRestriction): string {
  return isHardBlock(restriction)
    ? `This product is ${RESTRICTION_LABELS[restriction].toLowerCase()} and cannot be made available.`
    : `This product is restricted (${RESTRICTION_LABELS[restriction]}). An admin must review and confirm it before it can be made available.`;
}

export type EnableDecision =
  | { kind: "ENABLE" }
  | { kind: "ENABLE_CLEARING"; restriction: ProductRestriction }
  | { kind: "NEEDS_CONFIRMATION"; restriction: ProductRestriction }
  | { kind: "REFUSED"; reason: "HARD_BLOCK" | "ADMIN_ONLY" };

/** A confirmation counts only when the box is ticked AND the reason is non-blank. */
export function isConfirmed(confirmed: boolean, reason: string | null | undefined): boolean {
  return confirmed && typeof reason === "string" && reason.trim().length > 0;
}

/** May this actor switch this product on? */
export function decideEnable(input: {
  restriction: ProductRestriction | null;
  actor: RestrictionActor;
  confirmed: boolean;
  reason: string | null | undefined;
}): EnableDecision {
  const { restriction, actor } = input;
  if (restriction === null) return { kind: "ENABLE" };
  if (isHardBlock(restriction)) return { kind: "REFUSED", reason: "HARD_BLOCK" };
  if (actor !== "ADMIN") return { kind: "REFUSED", reason: "ADMIN_ONLY" };
  if (!isConfirmed(input.confirmed, input.reason)) {
    return { kind: "NEEDS_CONFIRMATION", restriction };
  }
  return { kind: "ENABLE_CLEARING", restriction };
}

export type SetRestrictionDecision =
  | { kind: "ALLOWED" }
  | { kind: "NO_CHANGE" }
  | { kind: "REFUSED"; reason: "ADMIN_ONLY" | "WOULD_LOOSEN" };

/**
 * May this actor change a product's restriction from `from` to `to`? Only ever tightening: the one
 * way to loosen is `decideEnable`'s audited ENABLE_CLEARING, which refuses the hard blocks — so no
 * path in the application releases a PROHIBITED or AGE_RESTRICTED product.
 */
export function decideSetRestriction(
  from: ProductRestriction | null,
  to: ProductRestriction | null,
  actor: RestrictionActor,
): SetRestrictionDecision {
  if (actor !== "ADMIN") return { kind: "REFUSED", reason: "ADMIN_ONLY" };
  if (from === to) return { kind: "NO_CHANGE" };
  if (severity(to) < severity(from)) return { kind: "REFUSED", reason: "WOULD_LOOSEN" };
  return { kind: "ALLOWED" };
}

/** The values an ADMIN's restriction selector may offer for a product currently at `from`. */
export function allowedRestrictionTargets(from: ProductRestriction | null): ProductRestriction[] {
  return PRODUCT_RESTRICTIONS.filter((r) => severity(r) >= severity(from));
}

/* ------------------------------------------------------------------------- *
 * Bulk actions
 * ------------------------------------------------------------------------- */

export const BULK_ACTIONS = ["ENABLE", "DISABLE", "MARK_UNTRACKED"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export function isBulkAction(value: unknown): value is BulkAction {
  return typeof value === "string" && (BULK_ACTIONS as readonly string[]).includes(value);
}

/** The largest selection one bulk action accepts — the list page's largest page. */
export const MAX_BULK_SELECTION = 100;

export interface BulkCandidate {
  id: string;
  name: string;
  isActive: boolean;
  restriction: ProductRestriction | null;
  stockMode: StockMode;
}

export type BulkSkipReason = "HARD_BLOCK" | "ADMIN_ONLY" | "NEEDS_CONFIRMATION" | "NOT_FOUND";

export type BulkOutcome =
  | { kind: "ENABLE" }
  | { kind: "ENABLE_CLEARING"; restriction: ProductRestriction }
  | { kind: "DISABLE" }
  | { kind: "MARK_UNTRACKED" }
  | { kind: "NO_CHANGE" }
  | { kind: "SKIPPED"; reason: BulkSkipReason };

export interface BulkPlanEntry {
  productId: string;
  /** Null only for NOT_FOUND, where there is no product to name. */
  name: string | null;
  restriction: ProductRestriction | null;
  outcome: BulkOutcome;
}

/** The outcome bulk ENABLE gives one product — `decideEnable` for that product alone. */
export function bulkEnableOutcome(
  product: BulkCandidate,
  actor: RestrictionActor,
  confirmation: { confirmed: boolean; reason: string | null | undefined },
): BulkOutcome {
  const decision = decideEnable({
    restriction: product.restriction,
    actor,
    confirmed: confirmation.confirmed,
    reason: confirmation.reason,
  });
  switch (decision.kind) {
    case "ENABLE":
      return product.isActive ? { kind: "NO_CHANGE" } : { kind: "ENABLE" };
    case "ENABLE_CLEARING":
      return { kind: "ENABLE_CLEARING", restriction: decision.restriction };
    case "NEEDS_CONFIRMATION":
      return { kind: "SKIPPED", reason: "NEEDS_CONFIRMATION" };
    case "REFUSED":
      return { kind: "SKIPPED", reason: decision.reason };
  }
}

/**
 * One plan entry per requested id, in request order, duplicates dropped. `products` is whatever the
 * caller found for this vendor; a requested id absent from it is NOT_FOUND (another vendor's product
 * is indistinguishable from one that does not exist). DISABLE never touches a restriction and
 * MARK_UNTRACKED never touches `isActive` or a restriction, so neither can publish anything.
 */
export function planBulkAction(
  action: BulkAction,
  requestedIds: readonly string[],
  products: readonly BulkCandidate[],
  actor: RestrictionActor,
  confirmation: { confirmed: boolean; reason: string | null | undefined },
): BulkPlanEntry[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const plan: BulkPlanEntry[] = [];
  for (const id of requestedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const product = byId.get(id);
    if (!product) {
      plan.push({
        productId: id,
        name: null,
        restriction: null,
        outcome: { kind: "SKIPPED", reason: "NOT_FOUND" },
      });
      continue;
    }
    let outcome: BulkOutcome;
    if (action === "ENABLE") {
      outcome = bulkEnableOutcome(product, actor, confirmation);
    } else if (action === "DISABLE") {
      outcome = product.isActive ? { kind: "DISABLE" } : { kind: "NO_CHANGE" };
    } else {
      outcome =
        product.stockMode === "UNTRACKED" ? { kind: "NO_CHANGE" } : { kind: "MARK_UNTRACKED" };
    }
    plan.push({ productId: id, name: product.name, restriction: product.restriction, outcome });
  }
  return plan;
}

/** What the preview's warning block lists (R24). */
export function summarisePlanRisks(plan: readonly BulkPlanEntry[]): {
  hardBlocked: BulkPlanEntry[];
  overridable: BulkPlanEntry[];
} {
  return {
    hardBlocked: plan.filter((e) => isHardBlock(e.restriction)),
    overridable: plan.filter((e) => e.restriction !== null && !isHardBlock(e.restriction)),
  };
}

/** Human text for a skip reason, for the bulk summary and the preview. */
export const BULK_SKIP_LABELS: Record<BulkSkipReason, string> = {
  HARD_BLOCK: "Hard-blocked — cannot be made available",
  ADMIN_ONLY: "Restricted — only an admin can enable it",
  NEEDS_CONFIRMATION: "Restricted — needs the admin confirmation and a reason",
  NOT_FOUND: "Not found",
};
