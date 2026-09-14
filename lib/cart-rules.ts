/**
 * Pure cart rules (P3a, #93) — no I/O, so they are unit-testable without a DB
 * (same split as lib/auth-origin.ts's buildAuthOrigin and lib/delivery.ts).
 * The repository and UI both consume these rather than re-deriving the maths.
 */

/** How the shopper chose to resolve a guest cart meeting a saved cart. */
export const MERGE_RESOLUTIONS = ["COMBINE", "KEEP_SAVED", "KEEP_NEW"] as const;
export type MergeResolution = (typeof MERGE_RESOLUTIONS)[number];

export function isMergeResolution(value: unknown): value is MergeResolution {
  return typeof value === "string" && (MERGE_RESOLUTIONS as readonly string[]).includes(value);
}

/**
 * Effective stock for a product. A product with NO Inventory row is treated as
 * out of stock — never as unlimited. `Product.inventory` is optional in the
 * schema, so this is a real case, not a defensive nicety.
 */
export function effectiveStock(inventoryQuantity: number | null | undefined): number {
  return typeof inventoryQuantity === "number" && inventoryQuantity > 0 ? inventoryQuantity : 0;
}

/**
 * Quantity after adding `delta` to `current`, clamped to [1, stock]. Returns 0
 * when nothing can be held (out of stock) — callers treat 0 as "refuse the add".
 * Quantity never lands on 0 by decrement: removal is an explicit, separate path.
 */
export function clampQuantity(current: number, delta: number, stock: number): number {
  if (stock <= 0) return 0;
  const next = current + delta;
  if (next < 1) return 1;
  return Math.min(next, stock);
}

export interface MergeLine {
  productId: string;
  quantity: number;
}

/**
 * The resulting lines after applying the shopper's chosen resolution.
 * `stockFor` supplies each product's effective stock so COMBINE can cap.
 *
 * Idempotent by construction: it is a pure function of its inputs, and the
 * caller deletes the guest cart as part of applying the result — so re-running
 * with an already-merged state (empty guest side) yields the same lines.
 */
export function resolveMerge(
  resolution: MergeResolution,
  savedLines: MergeLine[],
  guestLines: MergeLine[],
  stockFor: (productId: string) => number,
): MergeLine[] {
  if (resolution === "KEEP_SAVED") return savedLines.map((l) => ({ ...l }));
  if (resolution === "KEEP_NEW") return guestLines.map((l) => ({ ...l }));

  // COMBINE — sum per product, then cap each at that product's stock.
  const totals = new Map<string, number>();
  for (const line of [...savedLines, ...guestLines]) {
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  }
  return [...totals.entries()]
    .map(([productId, quantity]) => ({
      productId,
      quantity: Math.min(quantity, stockFor(productId)),
    }))
    .filter((l) => l.quantity > 0);
}

/**
 * Collapse repeated products into one entry, summing quantities and preserving
 * first-seen order (P3d, #114). A pasted list can name the same product twice
 * ("apples" and "2x apples"), and two upserts of the same row inside one
 * transaction would fight each other — so the caller writes one line per
 * product, not one per typed line.
 */
export function sumLinesByProduct(lines: MergeLine[]): MergeLine[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  }
  return [...totals.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * A merge decision is pending only when BOTH carts hold items — otherwise there
 * is nothing to decide and resolution is automatic (adopt / discard), so the
 * common path stays frictionless.
 */
export function isMergePending(savedItemCount: number, guestItemCount: number): boolean {
  return savedItemCount > 0 && guestItemCount > 0;
}

/** Exactly one of userId / guestToken must identify a cart. */
export function assertSingleIdentity(userId: string | null, guestToken: string | null): void {
  if ((userId === null) === (guestToken === null)) {
    throw new Error("Cart identity must be exactly one of userId or guestToken");
  }
}

/**
 * What the cart, `/cart` and `/checkout` tell the shopper about their progress
 * towards being able to order, and towards free delivery (#748).
 *
 * ## Why one function and not three
 *
 * This supersedes `deliveryProgress(subtotalPence, thresholdPence)`, which knew
 * only about the free-delivery threshold. Because it had no concept of the
 * vendor minimum or the fulfilment method, every surface that needed either
 * computed it itself — the drawer advertised "FREE Local Delivery" under Click &
 * Collect, and the vendor minimum appeared only as a static banner on
 * `/checkout` and nowhere in the cart. The two-argument signature is deliberately
 * GONE rather than kept alongside: leaving it in place would leave the
 * method-blind behaviour reachable, which is the defect.
 *
 * ## Ordering
 *
 * The minimum is evaluated FIRST and independently of method, matching the rule
 * `placeOrder` already enforces (`lib/repositories/orders.ts`) — an order below
 * the vendor's minimum cannot be placed by delivery OR collection, so telling a
 * collecting shopper about free delivery before they can order at all would be
 * advertising the wrong next step.
 *
 * Free delivery is only ever reported for DELIVERY. Collection has no fee to
 * waive, so "you unlocked free delivery" on a collection order is a claim about
 * money the shopper was never going to be charged.
 */
export type FulfilmentProgress =
  /** Nothing worth telling the shopper: no minimum to reach and no free-delivery offer. */
  | { kind: "none" }
  /** Below the vendor's minimum order — blocks checkout for BOTH methods. */
  | { kind: "below-minimum"; remainingPence: number; percent: number }
  /** DELIVERY, minimum met, still short of free delivery. */
  | { kind: "delivery-remaining"; remainingPence: number; percent: number }
  /** DELIVERY, free delivery earned. */
  | { kind: "delivery-unlocked" }
  /** COLLECTION, minimum met — ready to collect, with no fee in play at all. */
  | { kind: "collection-ready" };

export interface FulfilmentProgressRules {
  method: "DELIVERY" | "COLLECTION";
  /** 0 when this vendor sets no minimum. */
  minimumOrderPence: number;
  /** null when this vendor never offers free delivery. */
  freeDeliveryThresholdPence: number | null;
}

/** Whole percent of `target` reached by `subtotalPence`, clamped to 0-100. */
function percentTowards(subtotalPence: number, target: number): number {
  if (target <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((subtotalPence / target) * 100)));
}

export function fulfilmentProgress(
  subtotalPence: number,
  rules: FulfilmentProgressRules,
): FulfilmentProgress {
  const { method, minimumOrderPence, freeDeliveryThresholdPence } = rules;

  if (minimumOrderPence > 0 && subtotalPence < minimumOrderPence) {
    return {
      kind: "below-minimum",
      remainingPence: minimumOrderPence - subtotalPence,
      percent: percentTowards(subtotalPence, minimumOrderPence),
    };
  }

  if (method === "COLLECTION") {
    // An empty collection cart at a vendor with no minimum has nothing to say.
    return minimumOrderPence > 0 ? { kind: "collection-ready" } : { kind: "none" };
  }

  if (freeDeliveryThresholdPence === null || freeDeliveryThresholdPence <= 0) {
    return { kind: "none" };
  }
  if (subtotalPence >= freeDeliveryThresholdPence) return { kind: "delivery-unlocked" };

  return {
    kind: "delivery-remaining",
    remainingPence: freeDeliveryThresholdPence - subtotalPence,
    percent: percentTowards(subtotalPence, freeDeliveryThresholdPence),
  };
}
