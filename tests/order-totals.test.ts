import { describe, it, expect } from "vitest";
import {
  buildOrderNumber,
  computeTotals,
  splitDiscount,
  vendorOrderPrefix,
  type DeliveryRules,
  type TotalsLine,
} from "@/lib/order-totals";

// lib/order-totals.ts is pure — no lib/db import — so no @prisma/client/wasm mocking.

const line = (unitPricePence: number, quantity: number, available = true): TotalsLine => ({
  unitPricePence,
  quantity,
  available,
});

const AHEED = { deliveryFeePence: 349, freeDeliveryThresholdPence: 3000 };
const NO_FREE = { deliveryFeePence: 299, freeDeliveryThresholdPence: null };

describe("computeTotals — subtotal", () => {
  it("sums unit price × quantity across lines", () => {
    expect(computeTotals([line(89, 2), line(150, 1)], AHEED).subtotalPence).toBe(328);
  });

  it("excludes unavailable lines from the subtotal", () => {
    const totals = computeTotals([line(89, 2), line(9999, 1, false)], AHEED);
    expect(totals.subtotalPence).toBe(178);
  });
});

describe("computeTotals — delivery fee boundary", () => {
  it("charges the vendor's fee below the threshold", () => {
    expect(computeTotals([line(2999, 1)], AHEED).deliveryFeePence).toBe(349);
  });

  it("is free exactly AT the threshold", () => {
    expect(computeTotals([line(3000, 1)], AHEED).deliveryFeePence).toBe(0);
  });

  it("is free above the threshold", () => {
    expect(computeTotals([line(3001, 1)], AHEED).deliveryFeePence).toBe(0);
  });

  it("never goes free when the vendor sets no threshold", () => {
    expect(computeTotals([line(100000, 1)], NO_FREE).deliveryFeePence).toBe(299);
  });

  it("charges no delivery on an empty subtotal", () => {
    expect(computeTotals([], AHEED).deliveryFeePence).toBe(0);
    expect(computeTotals([line(500, 1, false)], AHEED).deliveryFeePence).toBe(0);
  });

  it("uses each vendor's own rules — no shared constant", () => {
    // £40 is free for Aheed (£30 threshold) but not for a £50-threshold vendor.
    expect(computeTotals([line(4000, 1)], AHEED).deliveryFeePence).toBe(0);
    expect(
      computeTotals([line(4000, 1)], { deliveryFeePence: 299, freeDeliveryThresholdPence: 5000 })
        .deliveryFeePence,
    ).toBe(299);
  });
});

describe("computeTotals — total", () => {
  it("is always subtotal + delivery fee", () => {
    const totals = computeTotals([line(89, 2)], AHEED);
    expect(totals.totalPence).toBe(totals.subtotalPence + totals.deliveryFeePence);
    expect(totals.totalPence).toBe(178 + 349);
  });
});

describe("vendorOrderPrefix", () => {
  it("takes the first three alphanumerics of the slug, uppercased", () => {
    expect(vendorOrderPrefix("aheed-food-centre")).toBe("AHE");
    expect(vendorOrderPrefix("srimart")).toBe("SRI");
  });

  it("pads a short slug rather than producing a ragged prefix", () => {
    expect(vendorOrderPrefix("ab")).toBe("ABX");
  });

  it("falls back when a slug has no usable characters", () => {
    expect(vendorOrderPrefix("---")).toBe("ORD");
  });
});

describe("buildOrderNumber", () => {
  const at = new Date(Date.UTC(2026, 7, 10)); // 2026-08-10

  it("is {VENDOR}-{YYYYMMDD}-{6 chars}", () => {
    const number = buildOrderNumber("aheed-food-centre", at, () => 0);
    expect(number).toMatch(/^AHE-20260810-[A-Z0-9]{6}$/);
  });

  it("derives the prefix per vendor rather than hardcoding one", () => {
    expect(buildOrderNumber("srimart", at, () => 0).startsWith("SRI-")).toBe(true);
  });

  it("is not sequential — the trailing segment comes from the random source", () => {
    const a = buildOrderNumber("aheed-food-centre", at, () => 0);
    const b = buildOrderNumber("aheed-food-centre", at, () => 0.99);
    expect(a).not.toBe(b);
  });

  it("avoids ambiguous characters so a number can be read aloud or transcribed", () => {
    const code = buildOrderNumber("aheed-food-centre", at, () => 0.5).split("-")[2];
    expect(code).not.toMatch(/[IO01]/);
  });
});

// ---- P5a — discount (#135) --------------------------------------------------
// Appended, not edited: R17 requires every pre-existing case above to keep
// passing unmodified, which is what proves a zero discount changed nothing.

describe("computeTotals — discount (P5a)", () => {
  it("returns the applied discount alongside the other money (R14)", () => {
    const totals = computeTotals([line(1000, 1)], AHEED, 250);
    expect(totals.discountPence).toBe(250);
    expect(totals.totalPence).toBe(1000 - 250 + 349);
  });

  it("defaults to no discount when the argument is omitted (R17)", () => {
    expect(computeTotals([line(1000, 1)], AHEED).discountPence).toBe(0);
  });

  it("keeps subtotal - discount + delivery = total for every shape (R15)", () => {
    const cases: { lines: TotalsLine[]; rules: DeliveryRules; discount: number }[] = [
      { lines: [line(1000, 1)], rules: AHEED, discount: 0 },
      { lines: [line(1000, 1)], rules: AHEED, discount: 250 },
      { lines: [line(3000, 1)], rules: AHEED, discount: 500 },
      { lines: [line(3000, 1)], rules: AHEED, discount: 3000 },
      { lines: [line(899, 3)], rules: NO_FREE, discount: 100 },
      { lines: [line(899, 3)], rules: NO_FREE, discount: 99999 },
      { lines: [], rules: AHEED, discount: 500 },
      { lines: [line(500, 1, false)], rules: NO_FREE, discount: 250 },
    ];
    for (const c of cases) {
      const t = computeTotals(c.lines, c.rules, c.discount);
      expect(t.subtotalPence - t.discountPence + t.deliveryFeePence).toBe(t.totalPence);
    }
  });

  it("never discounts more than the goods are worth (R15)", () => {
    const totals = computeTotals([line(1000, 1)], NO_FREE, 99999);
    expect(totals.discountPence).toBe(1000);
    expect(totals.totalPence).toBe(299);
  });

  it("treats a negative discount as none", () => {
    expect(computeTotals([line(1000, 1)], NO_FREE, -500).discountPence).toBe(0);
  });

  it("judges free delivery on the subtotal BEFORE the discount (R16)", () => {
    // £30 of goods earns free delivery; spending points must not claw it back.
    const totals = computeTotals([line(3000, 1)], AHEED, 500);
    expect(totals.deliveryFeePence).toBe(0);
    expect(totals.totalPence).toBe(2500);
  });

  it("still charges delivery below the threshold with no discount (R16)", () => {
    // The paired case: proves the row above tests the ordering, not just that
    // free delivery works at all.
    expect(computeTotals([line(2900, 1)], AHEED, 0).deliveryFeePence).toBe(349);
  });
});

describe("splitDiscount (P7.5b, #150)", () => {
  // What matters here is not the individual numbers but the INVARIANT: the two
  // shares must always reconstitute the single figure they decompose. An order
  // page renders both rows next to `discountPence`'s effect on the total, so a
  // split that does not sum is arithmetic the customer can see is wrong.
  const cases: {
    name: string;
    discountPence: number;
    code: { code: string; amountPence: number } | null;
  }[] = [
    { name: "code only", discountPence: 500, code: { code: "WELCOME10", amountPence: 500 } },
    { name: "loyalty only", discountPence: 200, code: null },
    { name: "both", discountPence: 700, code: { code: "WELCOME10", amountPence: 500 } },
    { name: "neither", discountPence: 0, code: null },
  ];

  for (const { name, discountPence, code } of cases) {
    it(`${name}: the two shares sum to discountPence (R9)`, () => {
      const { codePence, loyaltyPence } = splitDiscount({ discountPence, discountCode: code });
      expect(codePence + loyaltyPence).toBe(discountPence);
    });
  }

  it("attributes a code-only discount entirely to the code (R7)", () => {
    expect(
      splitDiscount({ discountPence: 500, discountCode: { code: "X", amountPence: 500 } }),
    ).toEqual({ codePence: 500, loyaltyPence: 0 });
  });

  it("attributes a no-code discount entirely to loyalty (R12)", () => {
    // placeOrder is discountPence's only writer and composes it from exactly two
    // sources, so "no code" leaves only one thing it can be.
    expect(splitDiscount({ discountPence: 200, discountCode: null })).toEqual({
      codePence: 0,
      loyaltyPence: 200,
    });
  });

  it("splits a combined discount along the stored code snapshot (R7)", () => {
    expect(
      splitDiscount({ discountPence: 700, discountCode: { code: "X", amountPence: 500 } }),
    ).toEqual({ codePence: 500, loyaltyPence: 200 });
  });

  it("never returns a negative loyalty share", () => {
    // Unreachable through placeOrder — lib/discounts.ts clamps the code's face
    // value and clampRedemption only fills the headroom it left — but the floor
    // is asserted so a future writer of discountPence cannot produce a negative
    // row without a test failing.
    expect(
      splitDiscount({ discountPence: 100, discountCode: { code: "X", amountPence: 500 } })
        .loyaltyPence,
    ).toBe(0);
  });
});
