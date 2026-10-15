import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1101 / #1034 (R1–R4) — `getRewardsDataForUser` runs on every storefront render and from
 * `/api/rewards`. On a vendor with loyalty OFF it must touch nothing past the config: in particular
 * not `getReferralStats`, which get-or-creates a live, redeemable referral code (#991).
 */

const loyalty = {
  config: vi.fn(),
  balance: vi.fn(),
  tiers: vi.fn(),
  windowSpend: vi.fn(),
};
const getReferralStats = vi.fn();

vi.mock("@/lib/loyalty-service", () => ({ getLoyaltyRepository: () => loyalty }));
vi.mock("@/lib/referrals-service", () => ({
  getReferralStats: (userId: string) => getReferralStats(userId),
}));

const { getRewardsDataForUser } = await import("@/lib/rewards-service");

const BASE_URL = "https://shop.example";
const USER = "u-1";

const config = (loyaltyEnabled: boolean) => ({
  loyaltyEnabled,
  pointsPerPoundEarned: 2,
  pencePerPointRedeemed: 3,
  minRedeemPoints: 150,
  tierWindowDays: 30,
  pointsExpiryMonths: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  loyalty.balance.mockResolvedValue({
    balancePoints: 40,
    storedPoints: 40,
    lifetimePoints: 40,
    lastActivityAt: null,
    lapsed: false,
  });
  loyalty.tiers.mockResolvedValue([]);
  loyalty.windowSpend.mockResolvedValue(0);
  getReferralStats.mockResolvedValue({
    referralCode: "REF-ABCD2345",
    completedCount: 1,
    discountOffPence: 500,
    rewardPoints: 100,
  });
});

describe("getRewardsDataForUser on a loyalty-off vendor (#1101)", () => {
  it("makes no loyalty or referral call for a signed-in shopper (R1)", async () => {
    loyalty.config.mockResolvedValue(config(false));

    await getRewardsDataForUser(USER, BASE_URL);

    expect(loyalty.balance).not.toHaveBeenCalled();
    expect(loyalty.tiers).not.toHaveBeenCalled();
    expect(loyalty.windowSpend).not.toHaveBeenCalled();
    expect(getReferralStats).not.toHaveBeenCalled();
  });

  it("returns the empty shape, still marked authenticated (R2)", async () => {
    loyalty.config.mockResolvedValue(config(false));

    const data = await getRewardsDataForUser(USER, BASE_URL);

    expect(data).toMatchObject({
      authenticated: true,
      loyaltyEnabled: false,
      balancePoints: 0,
      tier: null,
      expiryDate: null,
      maxMultiplier: 1,
      referralCode: "",
      referralUrl: "",
      referralsCompleted: 0,
      pointsPerPoundEarned: 2,
      pencePerPointRedeemed: 3,
      minRedeemPoints: 150,
    });
  });
});

describe("getRewardsDataForUser on a loyalty-on vendor", () => {
  it("still reads the shopper's referral code once (R3)", async () => {
    loyalty.config.mockResolvedValue(config(true));

    const data = await getRewardsDataForUser(USER, BASE_URL);

    expect(getReferralStats).toHaveBeenCalledTimes(1);
    expect(getReferralStats).toHaveBeenCalledWith(USER);
    expect(data.authenticated).toBe(true);
    expect(data.referralCode).toBe("REF-ABCD2345");
  });
});

describe("getRewardsDataForUser for a signed-out visitor (R4)", () => {
  it.each([true, false])(
    "is unauthenticated and reads no referral code (loyaltyEnabled %s)",
    async (on) => {
      loyalty.config.mockResolvedValue(config(on));

      const data = await getRewardsDataForUser(null, BASE_URL);

      expect(data.authenticated).toBe(false);
      expect(getReferralStats).not.toHaveBeenCalled();
    },
  );
});
