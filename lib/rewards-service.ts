import { getLoyaltyRepository } from "@/lib/loyalty-service";
import { maxTierMultiplier, resolveTier } from "@/lib/loyalty";
import { getReferralStats } from "@/lib/referrals-service";
import { buildReferralUrl, REFERRAL_DISCOUNT_PENCE, REFERRAL_REWARD_POINTS } from "@/lib/referrals";
import type { RewardsData } from "@/components/rewards/RewardsPanel";

/**
 * Service facade resolving unified loyalty and referral data for a shopper.
 * Used by StorefrontChrome (server SSR) and /api/rewards (client polling).
 */
export async function getRewardsDataForUser(
  userId: string | null,
  baseUrl: string,
): Promise<RewardsData> {
  const loyalty = getLoyaltyRepository();
  const config = await loyalty.config();

  if (!userId) {
    return {
      authenticated: false,
      loyaltyEnabled: config.loyaltyEnabled,
      balancePoints: 0,
      expiryDate: null,
      pointsPerPoundEarned: config.pointsPerPoundEarned,
      pencePerPointRedeemed: config.pencePerPointRedeemed,
      minRedeemPoints: config.minRedeemPoints,
      tier: null,
      // #1077 — 1, not a tier read. A signed-out visitor has no tier, and `WaysToEarnAccordion`
      // hides the boost line at 1, so fetching this vendor's tiers here would buy a query to
      // render nothing. The signed-in branch below derives the real value from tiers it already has.
      maxMultiplier: 1,
      referralCode: "",
      referralsCompleted: 0,
      referralUrl: "",
      discountOffPence: REFERRAL_DISCOUNT_PENCE,
      rewardPoints: REFERRAL_REWARD_POINTS,
    };
  }

  const [balance, tiers, windowSpend, referralStats] = await Promise.all([
    loyalty.balance(userId, config),
    loyalty.tiers(),
    loyalty.windowSpend(userId, config.tierWindowDays),
    getReferralStats(userId),
  ]);

  const currentTier = resolveTier(tiers, windowSpend);

  let expiryDate: string | null = null;
  if (
    config.pointsExpiryMonths &&
    balance.lastActivityAt &&
    !balance.lapsed &&
    balance.balancePoints > 0
  ) {
    const deadline = new Date(balance.lastActivityAt);
    deadline.setUTCMonth(deadline.getUTCMonth() + config.pointsExpiryMonths);
    expiryDate = deadline.toLocaleDateString("en-GB", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  // #991 — an empty code means it could not be read or created; share no link rather than `?ref=`.
  const referralUrl = referralStats.referralCode
    ? buildReferralUrl(baseUrl, referralStats.referralCode)
    : "";

  return {
    authenticated: true,
    loyaltyEnabled: config.loyaltyEnabled,
    balancePoints: balance.balancePoints,
    expiryDate,
    pointsPerPoundEarned: config.pointsPerPoundEarned,
    pencePerPointRedeemed: config.pencePerPointRedeemed,
    minRedeemPoints: config.minRedeemPoints,
    tier: currentTier ? { name: currentTier.name, multiplierBps: currentTier.multiplierBps } : null,
    // #1077 — derived from the `tiers` ALREADY fetched in the Promise.all above, so this adds no
    // query. `/account/loyalty` computes the identical value the identical way.
    maxMultiplier: maxTierMultiplier(tiers),
    referralCode: referralStats.referralCode,
    referralsCompleted: referralStats.completedCount,
    referralUrl,
    discountOffPence: referralStats.discountOffPence,
    rewardPoints: referralStats.rewardPoints,
  };
}
