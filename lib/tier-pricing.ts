/**
 * Multi-buy tier pricing (P8.5d, #348) — pure, DB-free, unit-tested.
 *
 * A tier is a GROUP price: `groupQuantity` units for `groupPricePence`. A line's
 * quantity divides into whole groups charged at the group price, and whatever is
 * left over charges the product's `basePrice`.
 *
 *     qty 7, tier = 3 for £10.00, base £4.00
 *       2 groups x 3 units = £20.00
 *       1 remainder unit   =  £4.00
 *       line total         = £24.00   (vs £28.00 at base)
 *
 * WHY A GROUP PRICE AND NOT A REDUCED UNIT PRICE. The obvious alternative —
 * "buy 3+, each costs £Y" — cannot express "3 for the price of 2" exactly. On a
 * £5 item that is £10.00 for 3, and a unit price of `1000 / 3 = 333p` charges
 * £9.99: a penny short, on every group, visibly, forever. Group pricing is exact
 * integer arithmetic at every quantity, which is the same reason money is pence
 * everywhere else in this codebase.
 *
 * WHY THIS IS A PRICE AND NOT A DISCOUNT. Nothing here touches `DiscountCode`.
 * A codeless discount was rejected at /propose: `DiscountRedemption` has
 * `@@unique([orderId])` so an order carries at most one redemption row,
 * `evaluateCode` is subtotal-scoped and cannot express a per-line quantity
 * predicate, and #273 exists because rows were once written around
 * `placeOrder`'s transaction. A multi-buy IS the price of the goods — modelling
 * it that way leaves the discounts engine, its audit trail and its concurrency
 * guarantees completely untouched. See the slice plan for the full argument.
 *
 * CONSEQUENCE, stated because it surprises people: a tiered line's effective
 * unit price is fractional, so `unitPricePence * quantity` is NOT the line
 * total. Every caller that computes line money has to come through here.
 */

/**
 * A product's multi-buy tier, as any caller needs it to price a line.
 *
 * Deliberately structural rather than a Prisma row type: `lib/repositories`
 * hands one over, but so does a unit test and so does the seed, and none of them
 * should need a database row to compute a price.
 */
export interface ProductTier {
  /** Units per group. */
  groupQuantity: number;
  /** Pence charged for one whole group. */
  groupPricePence: number;
  isActive: boolean;
}

/**
 * Whether this tier can price anything at this quantity.
 *
 * `groupQuantity < 2` is refused rather than trusted: 1 would make every unit
 * "a group" (a straight markdown wearing a multi-buy's clothes, which belongs in
 * `Product.originalPrice`), and 0 or negative would divide by zero below. The
 * staff form validates this too, but a pure function that can be handed any row
 * from any source defends its own arithmetic.
 */
export function isTierApplicable(tier: ProductTier | null, quantity: number): boolean {
  if (tier === null || !tier.isActive) return false;
  if (!Number.isFinite(tier.groupQuantity) || tier.groupQuantity < 2) return false;
  if (!Number.isFinite(tier.groupPricePence) || tier.groupPricePence < 0) return false;
  return quantity >= tier.groupQuantity;
}

/**
 * What a line actually costs, in pence.
 *
 * Falls back to `basePrice * quantity` whenever no tier applies — a null tier,
 * an inactive one, or a quantity below the group size.
 *
 * NEVER RETURNS MORE THAN THE BASE TOTAL. A tier whose group price exceeds
 * `groupQuantity * basePrice` is a staff typo, and honouring it literally would
 * silently OVERCHARGE a shopper for buying more. The clamp makes that
 * unreachable rather than merely unlikely.
 */
export function tieredLineTotalPence(
  basePrice: number,
  quantity: number,
  tier: ProductTier | null,
): number {
  const baseTotal = basePrice * quantity;
  if (!isTierApplicable(tier, quantity)) return baseTotal;

  const { groupQuantity, groupPricePence } = tier as ProductTier;
  const groups = Math.floor(quantity / groupQuantity);
  const remainder = quantity % groupQuantity;
  const tiered = groups * groupPricePence + remainder * basePrice;

  return Math.min(tiered, baseTotal);
}

/**
 * What the shopper saves on this line by the tier applying, in pence.
 *
 * Always `>= 0` — it is the base total minus `tieredLineTotalPence`, which the
 * clamp above already guarantees is no larger. 0 when no tier applies.
 */
export function tierSavingPence(
  basePrice: number,
  quantity: number,
  tier: ProductTier | null,
): number {
  return basePrice * quantity - tieredLineTotalPence(basePrice, quantity, tier);
}

/**
 * The quantity at which this tier first pays off, or null when it never can.
 *
 * What the storefront badge needs in order to say "3 for £10.00" on a card whose
 * shopper has not added anything yet — `isTierApplicable` answers the question
 * for a line that already has a quantity, which a product card does not have.
 */
export function tierThresholdQuantity(tier: ProductTier | null): number | null {
  if (tier === null || !tier.isActive) return null;
  if (!Number.isFinite(tier.groupQuantity) || tier.groupQuantity < 2) return null;
  if (!Number.isFinite(tier.groupPricePence) || tier.groupPricePence < 0) return null;
  return tier.groupQuantity;
}
