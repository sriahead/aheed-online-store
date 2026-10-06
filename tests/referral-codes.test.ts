import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  countReferralRedemptions,
  getOrCreateReferralCode,
  MAX_REFERRAL_CODE_CREATE_ATTEMPTS,
  REFERRAL_CODE_DESCRIPTION,
} from "@/lib/repositories/referral-codes";
import { MIN_REFERRAL_ORDER_PENCE, REFERRAL_DISCOUNT_PENCE } from "@/lib/referrals";

/**
 * #991 / #987 (R6, R7, R8) — the shopper's referral code is found by owner, created at most once,
 * random, and a unique violation is told apart by re-reading the owner. The real-database proof of
 * the concurrent case is `scripts/verify-referral-code-integrity.ts concurrent` (R9).
 */

const VENDOR = "v-1";
const USER = "u-1";
const CODE_SHAPE = /^REF-[A-HJ-NP-Z2-9]{8}$/;

const findFirst = vi.fn();
const create = vi.fn();
const count = vi.fn();
const prisma = {
  discountCode: { findFirst, create },
  discountRedemption: { count },
} as never;

const violation = (code: string) => Object.assign(new Error("unique"), { code });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrCreateReferralCode", () => {
  it("R6 returns the owner's existing code and creates nothing", async () => {
    findFirst.mockResolvedValueOnce({ code: "REF-EXISTING" });
    await expect(getOrCreateReferralCode(prisma, VENDOR, USER)).resolves.toBe("REF-EXISTING");
    expect(findFirst).toHaveBeenCalledWith({
      where: { vendorId: VENDOR, referrerUserId: USER },
      select: { code: true },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("R7 creates exactly one random referral row with every field set", async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockImplementationOnce(async ({ data }) => ({ code: data.code }));

    const code = await getOrCreateReferralCode(prisma, VENDOR, USER);

    expect(code).toMatch(CODE_SHAPE);
    expect(create).toHaveBeenCalledTimes(1);
    const { data } = create.mock.calls[0][0];
    expect(data).toEqual({
      vendorId: VENDOR,
      code,
      referrerUserId: USER,
      description: REFERRAL_CODE_DESCRIPTION,
      kind: "FIXED_AMOUNT",
      value: REFERRAL_DISCOUNT_PENCE,
      minSubtotalPence: MIN_REFERRAL_ORDER_PENCE,
      maxPerCustomer: 1,
      remainingRedemptions: null,
      isActive: true,
    });
    expect(REFERRAL_CODE_DESCRIPTION).toBe("Customer referral code");
  });

  it.each(["P2002", "23505"])(
    "R8 returns the raced owner row after a %s violation (a concurrent request created it)",
    async (errorCode) => {
      findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ code: "REF-RACEWON" });
      create.mockRejectedValueOnce(violation(errorCode));

      await expect(getOrCreateReferralCode(prisma, VENDOR, USER)).resolves.toBe("REF-RACEWON");
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it("R8 retries with a fresh code when the code itself collided", async () => {
    findFirst.mockResolvedValue(null);
    create
      .mockRejectedValueOnce(violation("23505"))
      .mockImplementationOnce(async ({ data }) => ({ code: data.code }));

    const code = await getOrCreateReferralCode(prisma, VENDOR, USER);

    expect(code).toMatch(CODE_SHAPE);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].data.code).toBe(code);
  });

  it("R8 throws after 5 colliding creates", async () => {
    findFirst.mockResolvedValue(null);
    create.mockRejectedValue(violation("P2002"));

    await expect(getOrCreateReferralCode(prisma, VENDOR, USER)).rejects.toThrow(/collided/);
    expect(MAX_REFERRAL_CODE_CREATE_ATTEMPTS).toBe(5);
    expect(create).toHaveBeenCalledTimes(5);
  });

  it("R8 rethrows a non-unique error after exactly one create", async () => {
    findFirst.mockResolvedValue(null);
    const boom = Object.assign(new Error("connection reset"), { code: "P1001" });
    create.mockRejectedValueOnce(boom);

    await expect(getOrCreateReferralCode(prisma, VENDOR, USER)).rejects.toBe(boom);
    expect(create).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("countReferralRedemptions", () => {
  it("counts redemptions of the code this shopper owns on this vendor", async () => {
    count.mockResolvedValueOnce(3);
    await expect(countReferralRedemptions(prisma, VENDOR, USER)).resolves.toBe(3);
    expect(count).toHaveBeenCalledWith({
      where: { vendorId: VENDOR, code: { vendorId: VENDOR, referrerUserId: USER } },
    });
  });
});
