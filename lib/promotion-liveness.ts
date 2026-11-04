/**
 * Promotion liveness (R5) — pure, no dependencies, unit-testable under plain Node.
 *
 * `isActive` is the primary toggle; `startsAt` and `endsAt` define an optional
 * scheduling window. When null, the boundary is unconstrained.
 */

export interface PromotionLivenessFields {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

/**
 * Returns true if and only if the promotion is active and the current timestamp
 * falls within its startsAt and endsAt window (if configured).
 */
export function isPromotionLive(promo: PromotionLivenessFields, now: Date): boolean {
  if (!promo.isActive) return false;
  if (promo.startsAt !== null && promo.startsAt > now) return false;
  if (promo.endsAt !== null && promo.endsAt < now) return false;
  return true;
}
