/**
 * Pure loyalty rules (P5a, #135) — no I/O, so they're unit-testable without a
 * database (same split as lib/order-totals.ts, lib/cart-rules.ts,
 * lib/order-status.ts and lib/shopping-list.ts).
 *
 * Points are integers, money is integer pence, and tier multipliers are BASIS
 * POINTS (10000 = 1.0x). There is no floating-point arithmetic anywhere in the
 * earn or redeem path — a fractional point is as meaningless as a fractional
 * penny, and the same reasoning that put money in pence applies here.
 */

/**
 * The smallest total we will ever ask a payment provider to charge.
 *
 * Stripe rejects a GBP charge below 30p, so a redemption that drove the payable
 * total under this would create an order that exists and can never be paid for —
 * `placeOrder` would commit and then `createPayment` would fail, cancelling it.
 * Clamping here means that outcome is unreachable rather than merely rare.
 */
export const MIN_PAYABLE_PENCE = 30;

/** 1.0x, in basis points. The multiplier when no tier qualifies. */
export const DEFAULT_MULTIPLIER_BPS = 10000;

/**
 * What a shopper actually paid for goods — the basis for both earning and tier
 * qualification.
 *
 * Delivery is excluded because postage is not custom. The discount is excluded
 * because otherwise redeemed points would earn points, which is a slow value
 * leak with no obvious symptom: every redemption would partially refund itself
 * in new points, forever.
 */
export function eligibleSpendPence({
  subtotalPence,
  discountPence,
}: {
  subtotalPence: number;
  discountPence: number;
}): number {
  return Math.max(0, subtotalPence - discountPence);
}

/** Points earned for a given eligible spend, floored to whole pounds then to whole points. */
export function computePointsEarned(
  eligibleSpendPence: number,
  pointsPerPoundEarned: number,
  multiplierBps: number,
): number {
  if (eligibleSpendPence < 100) return 0;
  const wholePounds = Math.floor(eligibleSpendPence / 100);
  return Math.max(0, Math.floor((wholePounds * pointsPerPoundEarned * multiplierBps) / 10000));
}

/** Cash value of a points balance, in pence. */
export function pointsToPence(points: number, pencePerPointRedeemed: number): number {
  return Math.max(0, points) * pencePerPointRedeemed;
}

/**
 * Has this account gone quiet for long enough to lose its points?
 *
 * The rule is inactivity-based, not per-entry aging: points last as long as the
 * shopper keeps ordering. That is what makes expiry derivable from a single
 * column at read time instead of needing a scheduled sweep — this codebase has
 * no cron surface and P5a deliberately does not add one.
 *
 * Months are UTC calendar months, so "12 months" means the same date next year
 * rather than a 365-day approximation.
 */
export function isLapsed(
  lastActivityAt: Date | null,
  now: Date,
  pointsExpiryMonths: number | null,
): boolean {
  if (pointsExpiryMonths === null || lastActivityAt === null) return false;
  const deadline = new Date(lastActivityAt.getTime());
  deadline.setUTCMonth(deadline.getUTCMonth() + pointsExpiryMonths);
  return now.getTime() > deadline.getTime();
}

/**
 * The balance a shopper may actually see and spend.
 *
 * A lapsed account's stored `balancePoints` is deliberately left stale rather
 * than zeroed by a job; this is where the zero happens, and the next EARN resets
 * the column (see the repository's earn path) so the two never disagree for long.
 */
export function visibleBalance(
  balancePoints: number,
  lastActivityAt: Date | null,
  now: Date,
  pointsExpiryMonths: number | null,
): number {
  return isLapsed(lastActivityAt, now, pointsExpiryMonths) ? 0 : balancePoints;
}

export interface ClampRedemptionInput {
  requestedPoints: number;
  balancePoints: number;
  pencePerPointRedeemed: number;
  minRedeemPoints: number;
  subtotalPence: number;
  deliveryFeePence: number;
  /**
   * Discount already claimed on this order by something else — today, a P5b
   * discount code (#145). Defaults to 0, which is exactly P5a's behaviour.
   *
   * Points fill the headroom the code left rather than competing for the same
   * subtotal: without this, both mechanisms would each believe they own the
   * whole basket and their sum could exceed the goods or drive the payable total
   * under MIN_PAYABLE_PENCE.
   */
  existingDiscountPence?: number;
}

export interface ClampedRedemption {
  pointsSpent: number;
  discountPence: number;
}

const NOTHING: ClampedRedemption = { pointsSpent: 0, discountPence: 0 };

/**
 * Turn a requested points spend into the pair actually applied.
 *
 * Three caps, all enforced here rather than hoped for at the call site:
 *
 *  1. never more points than the shopper holds;
 *  2. never a discount larger than the goods (delivery is not discountable —
 *     otherwise points would pay for postage the shop still owes a courier);
 *  3. never a payable total below MIN_PAYABLE_PENCE.
 *
 * The order matters: the pence figure is capped first, and `pointsSpent` is then
 * derived back FROM the capped pence. That is what guarantees
 * `discountPence === pointsSpent * pencePerPointRedeemed` exactly — debiting the
 * requested points and applying a smaller capped discount would quietly charge a
 * shopper points that bought them nothing.
 *
 * A non-integer request is rejected outright rather than rounded: it can only
 * come from a tampered or malformed form, and silently reinterpreting it is how
 * a fractional-points bug becomes someone's balance.
 */
export function clampRedemption(input: ClampRedemptionInput): ClampedRedemption {
  const {
    requestedPoints,
    balancePoints,
    pencePerPointRedeemed,
    minRedeemPoints,
    subtotalPence,
    deliveryFeePence,
  } = input;

  if (!Number.isInteger(requestedPoints) || requestedPoints <= 0) return NOTHING;
  if (pencePerPointRedeemed < 1) return NOTHING;

  const affordable = Math.min(requestedPoints, Math.max(0, balancePoints));
  if (affordable <= 0) return NOTHING;

  // Cap 2 and cap 3, in pence — both reduced by any discount already claimed on
  // this order, so a code and a redemption together obey the same two limits
  // each obeys alone.
  const existing = Math.max(0, input.existingDiscountPence ?? 0);
  const headroom = subtotalPence + deliveryFeePence - existing - MIN_PAYABLE_PENCE;
  const maxDiscountPence = Math.max(0, Math.min(subtotalPence - existing, headroom));

  const cappedPence = Math.min(affordable * pencePerPointRedeemed, maxDiscountPence);

  // Derive the points back from the capped pence, never the other way round.
  const pointsSpent = Math.floor(cappedPence / pencePerPointRedeemed);
  if (pointsSpent <= 0 || pointsSpent < minRedeemPoints) return NOTHING;

  return { pointsSpent, discountPence: pointsSpent * pencePerPointRedeemed };
}

export interface LoyaltyTier {
  key: string;
  name: string;
  thresholdPence: number;
  multiplierBps: number;
}

/**
 * The tier a given qualifying spend earns — the highest threshold at or below it.
 * `null` when the vendor has no tiers, or the spend clears none of them, in which
 * case the caller applies DEFAULT_MULTIPLIER_BPS.
 */
export function resolveTier(tiers: LoyaltyTier[], spendPence: number): LoyaltyTier | null {
  let best: LoyaltyTier | null = null;
  for (const tier of tiers) {
    if (tier.thresholdPence > spendPence) continue;
    if (best === null || tier.thresholdPence > best.thresholdPence) best = tier;
  }
  return best;
}
