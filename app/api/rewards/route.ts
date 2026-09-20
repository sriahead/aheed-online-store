import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getLoyaltyRepository } from "@/lib/loyalty-service";
import { resolveTier } from "@/lib/loyalty";
import { getReferralStats, ensureReferralDiscountCode } from "@/lib/referrals-service";
import { buildReferralUrl } from "@/lib/referrals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  const loyalty = getLoyaltyRepository();
  const config = await loyalty.config();

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  if (!session?.user) {
    return NextResponse.json({
      authenticated: false,
      loyaltyEnabled: config.loyaltyEnabled,
      balancePoints: 0,
      expiryDate: null,
      pointsPerPoundEarned: config.pointsPerPoundEarned,
      pencePerPointRedeemed: config.pencePerPointRedeemed,
      minRedeemPoints: config.minRedeemPoints,
      tier: null,
      referralCode: "",
      referralsCompleted: 0,
      referralUrl: "",
      discountOffPence: 500,
      rewardPoints: 100,
    });
  }

  const userId = session.user.id;
  const [balance, tiers, windowSpend, referralStats] = await Promise.all([
    loyalty.balance(userId, config),
    loyalty.tiers(),
    loyalty.windowSpend(userId, config.tierWindowDays),
    getReferralStats(userId),
  ]);

  // Ensure their referral discount code is seeded in background
  ensureReferralDiscountCode(userId).catch(() => {});

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

  const referralUrl = buildReferralUrl(baseUrl, referralStats.referralCode);

  return NextResponse.json({
    authenticated: true,
    loyaltyEnabled: config.loyaltyEnabled,
    balancePoints: balance.balancePoints,
    expiryDate,
    pointsPerPoundEarned: config.pointsPerPoundEarned,
    pencePerPointRedeemed: config.pencePerPointRedeemed,
    minRedeemPoints: config.minRedeemPoints,
    tier: currentTier ? { name: currentTier.name, multiplierBps: currentTier.multiplierBps } : null,
    referralCode: referralStats.referralCode,
    referralsCompleted: referralStats.completedCount,
    referralUrl,
    discountOffPence: referralStats.discountOffPence,
    rewardPoints: referralStats.rewardPoints,
  });
}
