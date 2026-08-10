import { describe, it, expect } from "vitest";
import {
  buildOrderNumber,
  computeTotals,
  vendorOrderPrefix,
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
