import { describe, it, expect } from "vitest";
import {
  DEFAULT_MULTIPLIER_BPS,
  MIN_PAYABLE_PENCE,
  clampRedemption,
  computePointsEarned,
  eligibleSpendPence,
  isLapsed,
  pointsToPence,
  resolveTier,
  visibleBalance,
  type ClampRedemptionInput,
  type LoyaltyTier,
} from "@/lib/loyalty";

/**
 * Pure loyalty rules (P5a, #135). No database, no mocks — lib/loyalty.ts has no
 * I/O, which is the point of keeping it separate from lib/repositories/loyalty.ts.
 */

const NOW = new Date("2026-08-11T12:00:00.000Z");

/** Builds a date `months` UTC calendar months before NOW, optionally minus a day. */
function monthsBefore(months: number, extraDaysBefore = 0): Date {
  const d = new Date(NOW.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(d.getUTCDate() - extraDaysBefore);
  return d;
}

describe("constants (R2)", () => {
  it("pins the payable floor and the neutral multiplier", () => {
    expect(MIN_PAYABLE_PENCE).toBe(30);
    expect(DEFAULT_MULTIPLIER_BPS).toBe(10000);
  });
});

describe("eligibleSpendPence (R3)", () => {
  it("is the goods total less any discount", () => {
    expect(eligibleSpendPence({ subtotalPence: 1000, discountPence: 300 })).toBe(700);
    expect(eligibleSpendPence({ subtotalPence: 1000, discountPence: 0 })).toBe(1000);
  });

  it("floors at zero rather than going negative", () => {
    expect(eligibleSpendPence({ subtotalPence: 300, discountPence: 900 })).toBe(0);
  });
});

describe("computePointsEarned (R4, R5)", () => {
  it("floors to whole pounds, then applies rate and multiplier", () => {
    expect(computePointsEarned(1000, 1, 10000)).toBe(10);
    expect(computePointsEarned(1099, 1, 10000)).toBe(10);
    expect(computePointsEarned(1000, 1, 15000)).toBe(15);
    expect(computePointsEarned(1000, 2, 15000)).toBe(30);
    expect(computePointsEarned(1050, 1, 15000)).toBe(15);
  });

  it("earns nothing below a pound, and never goes negative", () => {
    expect(computePointsEarned(99, 1, 10000)).toBe(0);
    expect(computePointsEarned(0, 1, 10000)).toBe(0);
    expect(computePointsEarned(-500, 1, 10000)).toBe(0);
  });
});

describe("pointsToPence", () => {
  it("converts a balance to its cash value", () => {
    expect(pointsToPence(250, 1)).toBe(250);
    expect(pointsToPence(250, 2)).toBe(500);
    expect(pointsToPence(-5, 1)).toBe(0);
  });
});

describe("isLapsed (R6, R7)", () => {
  it("never lapses when the vendor sets no expiry", () => {
    expect(isLapsed(monthsBefore(120), NOW, null)).toBe(false);
  });

  it("never lapses an account that has no activity recorded", () => {
    expect(isLapsed(null, NOW, 12)).toBe(false);
  });

  it("lapses the day after the window, not on it", () => {
    expect(isLapsed(monthsBefore(12), NOW, 12)).toBe(false);
    expect(isLapsed(monthsBefore(12, 1), NOW, 12)).toBe(true);
  });
});

describe("visibleBalance (R8)", () => {
  it("hides a lapsed balance and shows a live one", () => {
    expect(visibleBalance(500, monthsBefore(13), NOW, 12)).toBe(0);
    expect(visibleBalance(500, monthsBefore(1), NOW, 12)).toBe(500);
  });

  it("agrees with isLapsed for every case, rather than restating constants", () => {
    const cases: { balance: number; last: Date | null; expiry: number | null }[] = [
      { balance: 500, last: monthsBefore(1), expiry: 12 },
      { balance: 500, last: monthsBefore(13), expiry: 12 },
      { balance: 0, last: monthsBefore(24), expiry: 12 },
      { balance: 900, last: monthsBefore(24), expiry: null },
      { balance: 900, last: null, expiry: 12 },
      { balance: 42, last: monthsBefore(12), expiry: 12 },
      { balance: 42, last: monthsBefore(12, 1), expiry: 12 },
    ];
    for (const c of cases) {
      const expected = isLapsed(c.last, NOW, c.expiry) ? 0 : c.balance;
      expect(visibleBalance(c.balance, c.last, NOW, c.expiry)).toBe(expected);
    }
  });
});

/**
 * The clamp table is reused by three separate assertions below (R9's exactness
 * invariant, R11's caps and R12's payable floor), so a case added here is
 * automatically covered by all three.
 */
const CLAMP_CASES: ClampRedemptionInput[] = [
  // nothing requested
  {
    requestedPoints: 0,
    balancePoints: 500,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 0,
    subtotalPence: 2000,
    deliveryFeePence: 349,
  },
  // negative and non-integer requests
  {
    requestedPoints: -50,
    balancePoints: 500,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 0,
    subtotalPence: 2000,
    deliveryFeePence: 349,
  },
  {
    requestedPoints: 10.5,
    balancePoints: 500,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 0,
    subtotalPence: 2000,
    deliveryFeePence: 349,
  },
  // ordinary partial redemption
  {
    requestedPoints: 200,
    balancePoints: 500,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 100,
    subtotalPence: 2000,
    deliveryFeePence: 349,
  },
  // below the vendor's minimum
  {
    requestedPoints: 50,
    balancePoints: 500,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 100,
    subtotalPence: 2000,
    deliveryFeePence: 349,
  },
  // more than the shopper holds
  {
    requestedPoints: 5000,
    balancePoints: 100,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 0,
    subtotalPence: 2000,
    deliveryFeePence: 349,
  },
  // more than the goods are worth
  {
    requestedPoints: 10000,
    balancePoints: 10000,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 0,
    subtotalPence: 200,
    deliveryFeePence: 0,
  },
  // the payable floor bites
  {
    requestedPoints: 10000,
    balancePoints: 10000,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 0,
    subtotalPence: 100,
    deliveryFeePence: 0,
  },
  // floor bites with a delivery fee in play
  {
    requestedPoints: 10000,
    balancePoints: 10000,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 0,
    subtotalPence: 500,
    deliveryFeePence: 349,
  },
  // points worth more than a penny each
  {
    requestedPoints: 300,
    balancePoints: 300,
    pencePerPointRedeemed: 5,
    minRedeemPoints: 0,
    subtotalPence: 2000,
    deliveryFeePence: 0,
  },
  // multi-penny points where the cap forces a partial spend
  {
    requestedPoints: 300,
    balancePoints: 300,
    pencePerPointRedeemed: 5,
    minRedeemPoints: 0,
    subtotalPence: 333,
    deliveryFeePence: 0,
  },
  // an empty basket
  {
    requestedPoints: 100,
    balancePoints: 500,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 0,
    subtotalPence: 0,
    deliveryFeePence: 0,
  },
  // a zero-value point configuration is refused outright
  {
    requestedPoints: 100,
    balancePoints: 500,
    pencePerPointRedeemed: 0,
    minRedeemPoints: 0,
    subtotalPence: 2000,
    deliveryFeePence: 0,
  },
];

describe("clampRedemption (R9-R12)", () => {
  it("always spends exactly the points the discount is worth (R9)", () => {
    for (const input of CLAMP_CASES) {
      const { pointsSpent, discountPence } = clampRedemption(input);
      expect(discountPence).toBe(pointsSpent * input.pencePerPointRedeemed);
    }
  });

  it("refuses zero, negative, non-integer and below-minimum requests (R10)", () => {
    const base = {
      balancePoints: 500,
      pencePerPointRedeemed: 1,
      minRedeemPoints: 0,
      subtotalPence: 2000,
      deliveryFeePence: 0,
    };
    expect(clampRedemption({ ...base, requestedPoints: 0 })).toEqual({
      pointsSpent: 0,
      discountPence: 0,
    });
    expect(clampRedemption({ ...base, requestedPoints: -50 })).toEqual({
      pointsSpent: 0,
      discountPence: 0,
    });
    expect(clampRedemption({ ...base, requestedPoints: 10.5 })).toEqual({
      pointsSpent: 0,
      discountPence: 0,
    });
    expect(clampRedemption({ ...base, requestedPoints: 50, minRedeemPoints: 100 })).toEqual({
      pointsSpent: 0,
      discountPence: 0,
    });
  });

  it("never exceeds the balance or the goods total (R11)", () => {
    for (const input of CLAMP_CASES) {
      const { pointsSpent, discountPence } = clampRedemption(input);
      expect(pointsSpent).toBeLessThanOrEqual(Math.max(0, input.balancePoints));
      expect(discountPence).toBeLessThanOrEqual(input.subtotalPence);
    }
  });

  it("never drives the payable total below the floor (R12)", () => {
    for (const input of CLAMP_CASES) {
      const { discountPence } = clampRedemption(input);
      const payable = input.subtotalPence - discountPence + input.deliveryFeePence;
      // An order with nothing in it is already below the floor before any
      // redemption; the rule is that redeeming never *causes* it.
      if (input.subtotalPence + input.deliveryFeePence >= MIN_PAYABLE_PENCE) {
        expect(payable).toBeGreaterThanOrEqual(MIN_PAYABLE_PENCE);
      } else {
        expect(discountPence).toBe(0);
      }
    }
  });

  it("leaves exactly the floor payable when the balance would cover everything (R12)", () => {
    expect(
      clampRedemption({
        requestedPoints: 10000,
        balancePoints: 10000,
        pencePerPointRedeemed: 1,
        minRedeemPoints: 0,
        subtotalPence: 100,
        deliveryFeePence: 0,
      }),
    ).toEqual({ pointsSpent: 70, discountPence: 70 });
  });
});

describe("resolveTier (R13)", () => {
  const tiers: LoyaltyTier[] = [
    { key: "SILVER", name: "Silver", thresholdPence: 5000, multiplierBps: 12500 },
    { key: "GOLD", name: "Gold", thresholdPence: 10000, multiplierBps: 15000 },
  ];

  it("picks the highest threshold at or below the spend", () => {
    expect(resolveTier(tiers, 4999)).toBeNull();
    expect(resolveTier(tiers, 5000)?.key).toBe("SILVER");
    expect(resolveTier(tiers, 9999)?.key).toBe("SILVER");
    expect(resolveTier(tiers, 10000)?.key).toBe("GOLD");
    expect(resolveTier(tiers, 20000)?.key).toBe("GOLD");
  });

  it("returns null when there are no tiers at all", () => {
    expect(resolveTier([], 99999)).toBeNull();
  });
});

/**
 * P5b (#145) — points now share the subtotal with a discount code. These cases
 * are ADDITIONS: every case above runs unchanged and still passes, which is what
 * proves `existingDiscountPence` defaults to the P5a behaviour (R13).
 */
describe("clampRedemption with an existing discount (P5b R13-R16)", () => {
  const base: ClampRedemptionInput = {
    requestedPoints: 100000,
    balancePoints: 100000,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 0,
    subtotalPence: 2000,
    deliveryFeePence: 0,
  };

  it("omitting the field reproduces the P5a result exactly (R13)", () => {
    // The same input the R12 case above asserts, with the new field absent.
    expect(
      clampRedemption({
        requestedPoints: 10000,
        balancePoints: 10000,
        pencePerPointRedeemed: 1,
        minRedeemPoints: 0,
        subtotalPence: 100,
        deliveryFeePence: 0,
      }),
    ).toEqual({ pointsSpent: 70, discountPence: 70 });

    // And passing an explicit zero is indistinguishable from omitting it.
    expect(clampRedemption({ ...base, existingDiscountPence: 0 })).toEqual(clampRedemption(base));
  });

  it("fills only the headroom the code left (R14)", () => {
    // £20 goods, £5 already discounted by a code, no delivery. Points may take
    // the remaining £15 minus the 30p payment floor.
    expect(clampRedemption({ ...base, existingDiscountPence: 500 })).toEqual({
      pointsSpent: 1470,
      discountPence: 1470,
    });
  });

  it("never exceeds the remaining goods or breaches the floor (R14)", () => {
    let state = 99;
    const random = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };

    for (let i = 0; i < 250; i++) {
      const subtotalPence = Math.floor(random() * 10000);
      const deliveryFeePence = Math.floor(random() * 500);
      const existingDiscountPence = i % 5 === 0 ? 0 : Math.floor(random() * subtotalPence);
      const input: ClampRedemptionInput = {
        requestedPoints: Math.floor(random() * 20000),
        balancePoints: Math.floor(random() * 20000),
        pencePerPointRedeemed: 1 + Math.floor(random() * 3),
        minRedeemPoints: 0,
        subtotalPence,
        deliveryFeePence,
        existingDiscountPence,
      };

      const { pointsSpent, discountPence } = clampRedemption(input);

      expect(discountPence).toBeLessThanOrEqual(Math.max(0, subtotalPence - existingDiscountPence));
      const payable = subtotalPence + deliveryFeePence - existingDiscountPence - discountPence;
      if (subtotalPence + deliveryFeePence - existingDiscountPence >= MIN_PAYABLE_PENCE) {
        expect(payable).toBeGreaterThanOrEqual(MIN_PAYABLE_PENCE);
      } else {
        expect(discountPence).toBe(0);
      }

      // R15 — points are still derived back FROM the capped pence.
      expect(discountPence).toBe(pointsSpent * input.pencePerPointRedeemed);
    }
  });

  it("spends nothing once the existing discount covers the goods (R16)", () => {
    expect(clampRedemption({ ...base, existingDiscountPence: 2000 })).toEqual({
      pointsSpent: 0,
      discountPence: 0,
    });
    expect(clampRedemption({ ...base, existingDiscountPence: 5000 })).toEqual({
      pointsSpent: 0,
      discountPence: 0,
    });
  });
});
