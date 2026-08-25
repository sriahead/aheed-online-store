import { describe, it, expect } from "vitest";
import {
  isTierApplicable,
  tierSavingPence,
  tierThresholdQuantity,
  tieredLineTotalPence,
  type ProductTier,
} from "@/lib/tier-pricing";

// lib/tier-pricing.ts is pure — no lib/db import — so no @prisma/client/wasm mocking.

const tier = (groupQuantity: number, groupPricePence: number, isActive = true): ProductTier => ({
  groupQuantity,
  groupPricePence,
  isActive,
});

/**
 * The slice's canonical example, and deliberately NOT divisible: 1000 / 3 has no
 * integer unit price, which is the whole reason this is a group model. Every
 * quantity assertion below is exact pence — if any of them ever needs a rounding
 * allowance, the model has regressed to the per-unit one that was rejected.
 */
const THREE_FOR_TEN = tier(3, 1000);
const BASE = 400;

describe("tieredLineTotalPence — the group/remainder rule", () => {
  it("charges base price below the group size (R6)", () => {
    expect(tieredLineTotalPence(BASE, 1, THREE_FOR_TEN)).toBe(400);
    expect(tieredLineTotalPence(BASE, 2, THREE_FOR_TEN)).toBe(800);
  });

  it("charges the group price at exactly the group size (R6)", () => {
    expect(tieredLineTotalPence(BASE, 3, THREE_FOR_TEN)).toBe(1000);
  });

  it("charges one group plus a base-price remainder just above it (R6)", () => {
    // 1 x £10.00 + 1 x £4.00
    expect(tieredLineTotalPence(BASE, 4, THREE_FOR_TEN)).toBe(1400);
    // 1 x £10.00 + 2 x £4.00
    expect(tieredLineTotalPence(BASE, 5, THREE_FOR_TEN)).toBe(1800);
  });

  it("charges two whole groups at twice the group size, with no remainder (R6)", () => {
    expect(tieredLineTotalPence(BASE, 6, THREE_FOR_TEN)).toBe(2000);
  });

  it("handles the plan's worked example: qty 7 = 2 groups + 1 remainder (R6)", () => {
    expect(tieredLineTotalPence(BASE, 7, THREE_FOR_TEN)).toBe(2400);
  });

  it("stays exact integer pence on a non-divisible tier at every quantity (R9)", () => {
    // 1000 / 3 is not an integer. Every one of these is exact anyway, which a
    // per-unit tier price could not achieve.
    const totals = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((q) =>
      tieredLineTotalPence(BASE, q, THREE_FOR_TEN),
    );
    expect(totals).toEqual([400, 800, 1000, 1400, 1800, 2000, 2400, 2800, 3000]);
    for (const total of totals) expect(Number.isInteger(total)).toBe(true);
  });

  it("prices 'three for the price of two' exactly (R9)", () => {
    // The case the per-unit model gets wrong: £5 item, 3 for £10.00.
    // A unit price of floor(1000/3) = 333 would charge 999, a penny short.
    expect(tieredLineTotalPence(500, 3, tier(3, 1000))).toBe(1000);
    expect(tieredLineTotalPence(500, 6, tier(3, 1000))).toBe(2000);
  });
});

describe("tieredLineTotalPence — falls back to base price", () => {
  it("returns base total when there is no tier (R6)", () => {
    expect(tieredLineTotalPence(BASE, 5, null)).toBe(2000);
  });

  it("returns base total when the tier is inactive (R6)", () => {
    expect(tieredLineTotalPence(BASE, 5, tier(3, 1000, false))).toBe(2000);
  });

  it("returns base total for a group size below 2", () => {
    // groupQuantity 1 would make every unit a "group" — that is a markdown,
    // which belongs in Product.originalPrice, not here.
    expect(tieredLineTotalPence(BASE, 5, tier(1, 300))).toBe(2000);
    expect(tieredLineTotalPence(BASE, 5, tier(0, 300))).toBe(2000);
  });

  it("returns base total for a zero quantity", () => {
    expect(tieredLineTotalPence(BASE, 0, THREE_FOR_TEN)).toBe(0);
  });
});

describe("tieredLineTotalPence — never charges more than base (R7)", () => {
  it("ignores a tier that is worse than the base price", () => {
    // 2 for £10.00 on a £4.00 item is £2.00 WORSE than buying two singly.
    // Honouring it literally would overcharge a shopper for buying more.
    expect(tieredLineTotalPence(400, 2, tier(2, 1000))).toBe(800);
  });

  it("ignores a worse tier at a quantity with a remainder too", () => {
    expect(tieredLineTotalPence(400, 5, tier(2, 1000))).toBe(2000);
  });

  it("applies a tier that exactly equals the base price without changing anything", () => {
    expect(tieredLineTotalPence(400, 3, tier(3, 1200))).toBe(1200);
  });
});

describe("tierSavingPence (R8)", () => {
  it("is the difference between base and tiered totals", () => {
    // qty 7 at base = £28.00, tiered = £24.00
    expect(tierSavingPence(BASE, 7, THREE_FOR_TEN)).toBe(400);
  });

  it("is 0 when no tier applies", () => {
    expect(tierSavingPence(BASE, 2, THREE_FOR_TEN)).toBe(0);
    expect(tierSavingPence(BASE, 5, null)).toBe(0);
    expect(tierSavingPence(BASE, 5, tier(3, 1000, false))).toBe(0);
  });

  it("is never negative, even for a tier worse than base price", () => {
    expect(tierSavingPence(400, 2, tier(2, 1000))).toBe(0);
  });
});

describe("isTierApplicable", () => {
  it("is false below the group size and true at or above it", () => {
    expect(isTierApplicable(THREE_FOR_TEN, 2)).toBe(false);
    expect(isTierApplicable(THREE_FOR_TEN, 3)).toBe(true);
    expect(isTierApplicable(THREE_FOR_TEN, 99)).toBe(true);
  });

  it("is false for null, inactive, or a malformed group size", () => {
    expect(isTierApplicable(null, 5)).toBe(false);
    expect(isTierApplicable(tier(3, 1000, false), 5)).toBe(false);
    expect(isTierApplicable(tier(1, 300), 5)).toBe(false);
    expect(isTierApplicable(tier(-2, 300), 5)).toBe(false);
  });
});

describe("tierThresholdQuantity", () => {
  it("reports the group size a card badge should advertise", () => {
    expect(tierThresholdQuantity(THREE_FOR_TEN)).toBe(3);
  });

  it("is null when there is nothing to advertise", () => {
    expect(tierThresholdQuantity(null)).toBeNull();
    expect(tierThresholdQuantity(tier(3, 1000, false))).toBeNull();
    expect(tierThresholdQuantity(tier(1, 300))).toBeNull();
  });
});
