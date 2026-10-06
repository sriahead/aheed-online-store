import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { REFERRAL_DISCOUNT_PENCE, REFERRAL_REWARD_POINTS } from "@/lib/referrals";
import {
  countReferralRedemptions,
  getOrCreateReferralCode,
} from "@/lib/repositories/referral-codes";

export interface ReferralStats {
  /** Empty when the code could not be read or created — callers then show no share link. */
  referralCode: string;
  completedCount: number;
  discountOffPence: number;
  rewardPoints: number;
}

/**
 * Request-scoped facade for a shopper's referral code and how often it has been used.
 *
 * #991 — the code row is created HERE, awaited, the first time it is needed (get-or-create), instead
 * of by a fire-and-forget `ensureReferralDiscountCode(...).catch(() => {})` after the response. So a
 * code is only ever shown once it exists and can be redeemed. A failure must not take down the
 * storefront chrome (`StorefrontChrome` renders this for every signed-in shopper), so it is logged
 * — never swallowed — and reported as an empty code, which the referral card renders as
 * "unavailable" rather than sharing a link that would not work.
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const fixed = { discountOffPence: REFERRAL_DISCOUNT_PENCE, rewardPoints: REFERRAL_REWARD_POINTS };
  try {
    const prisma = getPrisma();
    const vendorId = await getCurrentVendorId();
    const [referralCode, completedCount] = await Promise.all([
      getOrCreateReferralCode(prisma, vendorId, userId),
      countReferralRedemptions(prisma, vendorId, userId),
    ]);
    return { referralCode, completedCount, ...fixed };
  } catch (error) {
    console.error("Referrals: reading or creating the shopper's referral code failed", error);
    return { referralCode: "", completedCount: 0, ...fixed };
  }
}
