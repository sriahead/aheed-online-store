import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  generateReferralCode,
  REFERRAL_DISCOUNT_PENCE,
  REFERRAL_REWARD_POINTS,
  MIN_REFERRAL_ORDER_PENCE,
} from "@/lib/referrals";

export interface ReferralStats {
  referralCode: string;
  completedCount: number;
  discountOffPence: number;
  rewardPoints: number;
}

/**
 * Request-scoped facade for referral statistics and customer discount codes.
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const prisma = getPrisma();
  const vendorId = await getCurrentVendorId();
  const referralCode = generateReferralCode(userId);

  try {
    const codeRow = await prisma.discountCode.findUnique({
      where: { vendorId_code: { vendorId, code: referralCode } },
      select: {
        id: true,
        _count: {
          select: { redemptions: true },
        },
      },
    });

    return {
      referralCode,
      completedCount: codeRow?._count.redemptions ?? 0,
      discountOffPence: REFERRAL_DISCOUNT_PENCE,
      rewardPoints: REFERRAL_REWARD_POINTS,
    };
  } catch {
    return {
      referralCode,
      completedCount: 0,
      discountOffPence: REFERRAL_DISCOUNT_PENCE,
      rewardPoints: REFERRAL_REWARD_POINTS,
    };
  }
}

/**
 * Ensure the referral discount code exists in the database for the given user,
 * so when referred friends use it at checkout, they receive their welcome discount.
 */
export async function ensureReferralDiscountCode(userId: string): Promise<void> {
  const prisma = getPrisma();
  const vendorId = await getCurrentVendorId();
  const referralCode = generateReferralCode(userId);

  try {
    await prisma.discountCode.upsert({
      where: { vendorId_code: { vendorId, code: referralCode } },
      update: {},
      create: {
        vendorId,
        code: referralCode,
        description: `Referral from user ${userId}`,
        kind: "FIXED_AMOUNT",
        value: REFERRAL_DISCOUNT_PENCE,
        minSubtotalPence: MIN_REFERRAL_ORDER_PENCE,
        maxPerCustomer: 1,
        remainingRedemptions: null,
        isActive: true,
      },
    });
  } catch {
    // If concurrent insert happens or already exists, ignore
  }
}
