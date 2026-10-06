import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// lib/db imports @prisma/client/wasm, which vitest cannot resolve; the repository is mocked anyway.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(() => ({})) }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn(async () => "v-1") }));
vi.mock("@/lib/repositories/referral-codes", () => ({
  getOrCreateReferralCode: vi.fn(),
  countReferralRedemptions: vi.fn(),
}));
vi.mock("@/lib/loyalty-service", () => ({
  getLoyaltyRepository: () => ({
    config: async () => ({
      loyaltyEnabled: true,
      pointsPerPoundEarned: 1,
      pencePerPointRedeemed: 1,
      minRedeemPoints: 100,
      tierWindowDays: 365,
      pointsExpiryMonths: null,
    }),
    balance: async () => ({ balancePoints: 0, lastActivityAt: null, lapsed: false }),
    tiers: async () => [],
    windowSpend: async () => 0,
  }),
}));

const { getOrCreateReferralCode, countReferralRedemptions } =
  await import("@/lib/repositories/referral-codes");
const { getReferralStats } = await import("@/lib/referrals-service");
const { getRewardsDataForUser } = await import("@/lib/rewards-service");

/**
 * #991 (R10, R17) — the referral code is awaited, never fire-and-forget; a failure is logged and
 * reported as an empty code, and an empty code produces no `?ref=` link.
 */

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(getOrCreateReferralCode).mockReset();
  vi.mocked(countReferralRedemptions).mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("getReferralStats", () => {
  it("returns the awaited code and its redemption count", async () => {
    vi.mocked(getOrCreateReferralCode).mockResolvedValueOnce("REF-ABCDEFGH");
    vi.mocked(countReferralRedemptions).mockResolvedValueOnce(2);
    await expect(getReferralStats("u-1")).resolves.toEqual(
      expect.objectContaining({ referralCode: "REF-ABCDEFGH", completedCount: 2 }),
    );
    expect(getOrCreateReferralCode).toHaveBeenCalledWith({}, "v-1", "u-1");
  });

  it("R10 logs a failure with the Referrals: prefix and returns an empty code instead of throwing", async () => {
    vi.mocked(getOrCreateReferralCode).mockRejectedValueOnce(new Error("db down"));
    vi.mocked(countReferralRedemptions).mockResolvedValueOnce(4);

    const stats = await getReferralStats("u-1");

    expect(stats.referralCode).toBe("");
    expect(stats.completedCount).toBe(0);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0][0])).toMatch(/^Referrals:/);
  });
});

describe("getRewardsDataForUser", () => {
  it("R17 passes an empty referralUrl, never one ending ?ref=, when the code is empty", async () => {
    vi.mocked(getOrCreateReferralCode).mockRejectedValueOnce(new Error("db down"));
    vi.mocked(countReferralRedemptions).mockResolvedValueOnce(0);

    const data = await getRewardsDataForUser("u-1", "https://shop.example");

    expect(data.referralCode).toBe("");
    expect(data.referralUrl).toBe("");
  });

  it("builds the ?ref= link when there is a code", async () => {
    vi.mocked(getOrCreateReferralCode).mockResolvedValueOnce("REF-ABCDEFGH");
    vi.mocked(countReferralRedemptions).mockResolvedValueOnce(0);

    const data = await getRewardsDataForUser("u-1", "https://shop.example");

    expect(data.referralUrl).toBe("https://shop.example/?ref=REF-ABCDEFGH");
  });
});
