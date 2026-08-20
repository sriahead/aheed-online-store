/**
 * Pure order money rules (P3b, #96) — no I/O, so they're unit-testable without a
 * DB (same split as lib/cart-rules.ts and lib/auth-origin.ts).
 *
 * All money is integer pence. Delivery rules come from the vendor's VendorConfig,
 * never from constants: the design mockup hardcoded a £30 threshold, and copying
 * that would break the moment a second vendor sets its own.
 */

export interface TotalsLine {
  unitPricePence: number;
  quantity: number;
  /** Unavailable lines never contribute money (matches the cart's subtotal rule). */
  available: boolean;
}

export interface DeliveryRules {
  deliveryFeePence: number;
  /** null = this vendor never offers free delivery. */
  freeDeliveryThresholdPence: number | null;
}

export interface OrderTotals {
  subtotalPence: number;
  /** P5a (#135) — loyalty redemption today, discount codes in P5b. Always ≥ 0. */
  discountPence: number;
  deliveryFeePence: number;
  totalPence: number;
}

/**
 * The single place an order's money is decided.
 *
 * `discountPence` is applied to the subtotal but is deliberately evaluated
 * AFTER the free-delivery threshold: a shopper who bought £30 of goods earned
 * free delivery by buying them, and spending loyalty points shouldn't claw that
 * back. `placeOrder` applies the same before-discount rule to the vendor's
 * minimum order for the same reason.
 *
 * The caller is responsible for having clamped the discount (see
 * `clampRedemption` in lib/loyalty.ts); this function only defends the floor at
 * zero so a bad caller can't invert the total.
 */
export function computeTotals(
  lines: TotalsLine[],
  rules: DeliveryRules,
  discountPence = 0,
): OrderTotals {
  const subtotalPence = lines.reduce(
    (sum, line) => sum + (line.available ? line.unitPricePence * line.quantity : 0),
    0,
  );

  const qualifiesForFree =
    rules.freeDeliveryThresholdPence !== null &&
    rules.freeDeliveryThresholdPence > 0 &&
    subtotalPence >= rules.freeDeliveryThresholdPence;

  // An empty order carries no delivery fee — charging delivery on nothing would be
  // absurd, and checkout refuses an empty cart before this point anyway.
  const deliveryFeePence = subtotalPence === 0 || qualifiesForFree ? 0 : rules.deliveryFeePence;

  const appliedDiscount = Math.min(Math.max(0, discountPence), subtotalPence);

  return {
    subtotalPence,
    discountPence: appliedDiscount,
    deliveryFeePence,
    totalPence: subtotalPence - appliedDiscount + deliveryFeePence,
  };
}

/**
 * The discount code applied to an order, as an order page needs to render it.
 * `amountPence` is the SNAPSHOT stored on `DiscountRedemption` at redemption —
 * never recomputed from the code's current `value`, which an admin can edit.
 */
export interface OrderDiscountCode {
  code: string;
  amountPence: number;
}

/** How an order's single `discountPence` figure divides between its sources. */
export interface DiscountShares {
  /** Attributable to the discount code; 0 when no code was used. */
  codePence: number;
  /** The remainder, which is a loyalty redemption; 0 when there was none. */
  loyaltyPence: number;
}

/**
 * Split an order's `discountPence` into the parts it is actually made of (P7.5b,
 * #150).
 *
 * `Order.discountPence` is deliberately GENERIC — since P5b it can hold a
 * loyalty redemption, a discount code, or both added together — so labelling the
 * whole figure with a code's name states something false whenever both are
 * present. Only the code's share is stored (`DiscountRedemption.amountPence`),
 * so the loyalty share is obtained by SUBTRACTION.
 *
 * Not by recomputing `pointsToPence(points, pencePerPointRedeemed)` from the
 * REDEEM ledger row, which is the obvious-looking alternative and is wrong:
 * `pencePerPointRedeemed` is vendor config an admin can change after the order
 * was placed, and the ledger stores the redemption in POINTS, not pence. A
 * recomputed share would drift away from the `discountPence` sitting next to it
 * on the same page. Subtraction cannot drift — the two shares sum to the figure
 * they decompose, by construction.
 *
 * Deliberately does NOT cap `codePence` at `discountPence`: the snapshot is a
 * component OF that figure, so exceeding it is unreachable, and a defensive
 * branch here would be untestable code that quietly hides a real data defect if
 * one ever occurred.
 */
export function splitDiscount(order: {
  discountPence: number;
  discountCode: OrderDiscountCode | null;
}): DiscountShares {
  const codePence = order.discountCode?.amountPence ?? 0;
  return {
    codePence,
    loyaltyPence: Math.max(0, order.discountPence - codePence),
  };
}

/**
 * Vendor prefix for an order number: first three alphanumeric characters of the
 * vendor's slug, uppercased. Derived, never hardcoded — onboarding a vendor must
 * not require a code change (ADR-004's rule of thumb).
 */
export function vendorOrderPrefix(slug: string): string {
  const cleaned = slug.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (cleaned.slice(0, 3) || "ORD").padEnd(3, "X");
}

// Crockford-ish alphabet: no I/O/0/1, so a number read off a phone or a printed
// slip can't be transcribed ambiguously.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * `{VENDOR}-{YYYYMMDD}-{6 random}`, e.g. `AHE-20260810-K4M2XQ`.
 *
 * Deliberately NOT sequential: a sequential counter lets anyone who places two
 * orders infer the shop's total order volume. `randomFn` is injectable so tests
 * can assert the format deterministically.
 */
export function buildOrderNumber(
  slug: string,
  now: Date,
  randomFn: () => number = Math.random,
): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");

  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(randomFn() * CODE_ALPHABET.length)];
  }

  return `${vendorOrderPrefix(slug)}-${y}${m}${d}-${code}`;
}
