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
