/**
 * Savings framing for shopper-facing prices (#1523) — pure, DB-free, unit-tested.
 *
 * Shoppers weigh a concrete saving ("save £2.00") far more readily than they do the arithmetic
 * behind a price pair, so the card, Quick View and product page say what an offer is worth in
 * money. EVERY FIGURE HERE IS DERIVED FROM PRICES THE STORE ACTUALLY CHARGES — `originalPrice`
 * against `basePrice`, and the multi-buy tier through `tierSavingPence`, the same function the
 * cart prices with. Nothing is invented, so nothing here can state a saving the checkout will not
 * honour. That is also the line the UK unfair-trading rules draw: a reference price or a saving
 * must be real. The percentage is rounded DOWN for the same reason — "33%" for a third off is true,
 * "34%" would not be.
 *
 * One module rather than three hand-built strings, because the card, the drawer and the product
 * page used to format the multi-buy line separately and could drift apart.
 */
import { formatPrice } from "@/components/product/format-price";
import { tierSavingPence, tierThresholdQuantity, type ProductTier } from "@/lib/tier-pricing";

/** "Save £1.00 (20%)", or null when there is no markdown. */
export function savingLabel(originalPence: number | null, basePence: number): string | null {
  if (originalPence === null || !Number.isFinite(originalPence) || originalPence <= basePence) {
    return null;
  }
  const saving = originalPence - basePence;
  const percent = Math.floor((saving * 100) / originalPence);
  return percent >= 1 ? `Save ${formatPrice(saving)} (${percent}%)` : `Save ${formatPrice(saving)}`;
}

/**
 * "4 for £18.00 · save £2.00", or "4 for £18.00" when the group saves nothing, or null when the
 * tier cannot apply. The saving is what buying exactly one group saves against the base price.
 */
export function multiBuyLabel(basePence: number, tier: ProductTier | null): string | null {
  const quantity = tierThresholdQuantity(tier);
  if (quantity === null || tier === null) return null;
  const offer = `${quantity} for ${formatPrice(tier.groupPricePence)}`;
  const saving = tierSavingPence(basePence, quantity, tier);
  return saving > 0 ? `${offer} · save ${formatPrice(saving)}` : offer;
}
