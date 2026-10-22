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

/** The largest quantity one add may request — the pre-add picker's own upper bound. */
export const MAX_ADD_QUANTITY = 99;

/**
 * #1211 (ADR-007) — `Inventory.stockMode` and `Product.restriction`, restated as string unions so
 * this module stays free of any Prisma import. Prisma's generated enum types are these same string
 * literals, so a selected row passes straight in.
 */
export type StockMode = "UNKNOWN" | "TRACKED" | "UNTRACKED";
export type ProductRestriction =
  "PROHIBITED" | "AGE_RESTRICTED" | "NOT_DELIVERABLE" | "NEEDS_REVIEW";

export const STOCK_MODES: readonly StockMode[] = ["TRACKED", "UNTRACKED", "UNKNOWN"];

export function isStockMode(value: unknown): value is StockMode {
  return typeof value === "string" && (STOCK_MODES as readonly string[]).includes(value);
}

export type StockInput = { stockMode: StockMode; quantity: number } | null | undefined;

/**
 * The exact Product fields `purchasableQuantity` reads, as a Prisma `select` fragment. Spread it
 * into every query that feeds the rule, so a caller cannot forget `restriction` or `stockMode`.
 */
export const PURCHASABILITY_SELECT = {
  isActive: true,
  restriction: true,
  inventory: { select: { quantity: true, stockMode: true } },
} as const;

/**
 * The Product half of PURCHASABILITY_SELECT, for a query that already selects a wider `inventory`
 * (it must then add `stockMode` itself). A named fragment rather than an inline
 * `isActive: true, restriction: true`, because tests/storefront-product-visibility.test.ts reads
 * every inline `isActive: true` in the storefront repository as a WHERE that must carry category
 * visibility — and a `select` is not one.
 */
export const ELIGIBILITY_SELECT = { isActive: true, restriction: true } as const;

/** A product with NO Inventory row has no stated mode — that is UNKNOWN, never "tracked at 0". */
export function stockModeOf(inventory: StockInput): StockMode {
  return inventory?.stockMode ?? "UNKNOWN";
}

/**
 * #1211 — THE purchasability rule. How many of this product a shopper may hold, where 0 means "not
 * purchasable". The cart, checkout, bundles, every storefront mapper and `placeOrder` call this and
 * nothing else; tests/purchasability-single-source.test.ts fails on a re-derived quantity check.
 *
 * - restricted or inactive: 0, whatever the stock says.
 * - UNKNOWN (or no Inventory row): 0. Availability is never assumed.
 * - TRACKED: the quantity, floored at 0.
 * - UNTRACKED: MAX_ADD_QUANTITY, the per-line cap, whatever the (ignored) quantity is.
 */
export function purchasableQuantity(input: {
  isActive: boolean;
  restriction: ProductRestriction | null;
  inventory: StockInput;
}): number {
  if (input.restriction !== null || !input.isActive) return 0;
  const mode = stockModeOf(input.inventory);
  if (mode === "UNTRACKED") return MAX_ADD_QUANTITY;
  if (mode === "TRACKED") return Math.max(input.inventory?.quantity ?? 0, 0);
  return 0;
}

/**
 * #1211 — "Only N left" and the low-stock badge. TRACKED only: an UNTRACKED product's
 * `stockQuantity` is the per-line cap, not a count, and must never read as "Only 99 left".
 * Only meaningful while there is still stock to run out of — a zero-stock product renders the
 * out-of-stock control instead.
 */
export function showsLowStock(product: {
  inStock: boolean;
  stockMode: StockMode;
  stockQuantity: number;
  lowStockThreshold: number;
}): boolean {
  return (
    product.inStock &&
    product.stockMode === "TRACKED" &&
    product.stockQuantity > 0 &&
    product.stockQuantity <= product.lowStockThreshold
  );
}

/**
 * #956 — what one add actually did, so the button can say so. Before this the
 * add returned nothing and every resolved call read "Added", including a
 * sold-out product and a request clamped to the stock that was left.
 */
export type AddOutcome =
  | { kind: "added"; added: number; inCart: number }
  | { kind: "partial"; added: number; requested: number; inCart: number }
  | { kind: "none"; reason: "SOLD_OUT" | "INVALID_QUANTITY" }
  | { kind: "none"; reason: "AT_STOCK_LIMIT"; inCart: number };

export function isValidAddDelta(delta: number): boolean {
  return Number.isInteger(delta) && delta >= 1 && delta <= MAX_ADD_QUANTITY;
}

/**
 * #956 — the quantity an add should write (`null` = write nothing) and what to
 * tell the shopper.
 *
 * Unlike `clampQuantity`, this never writes a quantity at or below `current`.
 * When the cart already holds at least all the stock (stock can fall after an
 * add), an add used to write `stock` back — LOWERING the cart — while saying
 * "Added". An add now leaves the line alone and says nothing more fits; the
 * cart's own availability handling deals with a line above stock.
 */
export function classifyAdd(
  current: number,
  delta: number,
  stock: number,
): { write: number | null; outcome: AddOutcome } {
  if (!isValidAddDelta(delta)) {
    return { write: null, outcome: { kind: "none", reason: "INVALID_QUANTITY" } };
  }
  if (stock <= 0) return { write: null, outcome: { kind: "none", reason: "SOLD_OUT" } };
  if (current >= stock) {
    return { write: null, outcome: { kind: "none", reason: "AT_STOCK_LIMIT", inCart: current } };
  }
  if (current + delta <= stock) {
    const inCart = current + delta;
    return { write: inCart, outcome: { kind: "added", added: delta, inCart } };
  }
  return {
    write: stock,
    outcome: { kind: "partial", added: stock - current, requested: delta, inCart: stock },
  };
}

/**
 * #957 — what a bulk add (`addCartItems`) did with one product line, so a reorder or a cancelled
 * order's restore can say what it could not put back. Before this the bulk add returned nothing.
 */
export type BulkAddKind = "added" | "partial" | "unavailable" | "at_limit";

export interface BulkAddLine {
  productId: string;
  requested: number;
  added: number;
  kind: BulkAddKind;
}

/**
 * #957 — the bulk add's write rule and its report, for one merged line.
 *
 * The arithmetic is `clampQuantity`'s, with one change, the same one #956 made to the single add:
 * a line already in the cart is never written at or below its current quantity. When stock has
 * fallen below what the cart holds, `clampQuantity` returns `stock` and a bulk add used to LOWER the
 * line, silently. It now leaves the line alone and reports `at_limit`.
 */
export function classifyBulkAdd(
  existing: number,
  requested: number,
  stock: number,
): { write: number | null; line: Omit<BulkAddLine, "productId"> } {
  if (stock <= 0) {
    return { write: null, line: { requested, added: 0, kind: "unavailable" } };
  }
  const next = clampQuantity(existing, requested, stock);
  if (next <= existing) {
    return { write: null, line: { requested, added: 0, kind: "at_limit" } };
  }
  const added = next - existing;
  return {
    write: next,
    line: { requested, added, kind: added === requested ? "added" : "partial" },
  };
}

export interface MergeLine {
  productId: string;
  quantity: number;
  /**
   * #1135 — the line's shopper note. Optional so every existing caller (shop-your-list, bundles)
   * is unchanged; absent and `null` both mean "no note to write".
   */
  customNote?: string | null;
}

/** Copy `customNote` onto `line` only when one exists, so note-free results keep their old shape. */
function withNote(line: MergeLine, customNote: string | null | undefined): MergeLine {
  return customNote ? { ...line, customNote } : line;
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
  // #1135 — the guest line's note wins when it has one (the shopper's most recent intent),
  // otherwise the saved line's note survives.
  const notes = new Map<string, string>();
  for (const line of [...savedLines, ...guestLines]) {
    if (line.customNote) notes.set(line.productId, line.customNote);
  }
  return [...totals.entries()]
    .map(([productId, quantity]) =>
      withNote(
        { productId, quantity: Math.min(quantity, stockFor(productId)) },
        notes.get(productId),
      ),
    )
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
  const notes = new Map<string, string>();
  for (const line of lines) {
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
    // #1135 — the last non-empty note for a product is the one kept.
    if (line.customNote) notes.set(line.productId, line.customNote);
  }
  return [...totals.entries()].map(([productId, quantity]) =>
    withNote({ productId, quantity }, notes.get(productId)),
  );
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
