import { describe, expect, it } from "vitest";
import {
  availableBundleItems,
  bundleTotalPence,
  hasAvailableItems,
  isBundleItemAvailable,
  type BundleItemInput,
} from "@/lib/bundle-pricing";

/**
 * P8.5c (#347) — R10/R11.
 *
 * The whole point of these assertions is that a bundle's price is DERIVED. Every
 * expected value below is hand-computed from `basePrice × quantity` rather than
 * read back from the function under test, so a change in the summing rule fails
 * here rather than silently agreeing with itself.
 */

function item(overrides: Partial<BundleItemInput> = {}): BundleItemInput {
  return {
    productId: "p1",
    slug: "thing",
    name: "Thing",
    unitLabel: "£1.00 each",
    basePrice: 100,
    originalPrice: null,
    quantity: 1,
    isActive: true,
    stockQuantity: 10,
    ...overrides,
  };
}

describe("bundleTotalPence", () => {
  it("is 0 for an empty bundle", () => {
    expect(bundleTotalPence([])).toBe(0);
  });

  it("sums a single item at quantity 1", () => {
    expect(bundleTotalPence([item({ basePrice: 249 })])).toBe(249);
  });

  it("multiplies by quantity", () => {
    // 349 x 3 = 1047
    expect(bundleTotalPence([item({ basePrice: 349, quantity: 3 })])).toBe(1047);
  });

  it("sums a multi-item bundle", () => {
    const total = bundleTotalPence([
      item({ productId: "a", basePrice: 599, quantity: 2 }), // 1198
      item({ productId: "b", basePrice: 145, quantity: 1 }), // 145
      item({ productId: "c", basePrice: 1099, quantity: 3 }), // 3297
    ]);
    expect(total).toBe(1198 + 145 + 3297);
    expect(total).toBe(4640);
  });

  it("returns an integer number of pence, never a float", () => {
    const total = bundleTotalPence([
      item({ productId: "a", basePrice: 333, quantity: 3 }),
      item({ productId: "b", basePrice: 1, quantity: 7 }),
    ]);
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(999 + 7);
  });

  it("ignores a product's own originalPrice — that is a product fact, not a bundle price", () => {
    // A constituent on offer contributes its CURRENT price. Using originalPrice
    // here would inflate the bundle total above what the cart actually charges.
    expect(bundleTotalPence([item({ basePrice: 200, originalPrice: 300, quantity: 2 })])).toBe(400);
  });
});

describe("availability (R11)", () => {
  it("treats an inactive product as unavailable", () => {
    expect(isBundleItemAvailable(item({ isActive: false }))).toBe(false);
  });

  it("treats a zero-stock product as unavailable", () => {
    expect(isBundleItemAvailable(item({ stockQuantity: 0 }))).toBe(false);
  });

  it("requires BOTH active and in stock", () => {
    expect(isBundleItemAvailable(item({ isActive: false, stockQuantity: 5 }))).toBe(false);
    expect(isBundleItemAvailable(item({ isActive: true, stockQuantity: 0 }))).toBe(false);
    expect(isBundleItemAvailable(item({ isActive: true, stockQuantity: 1 }))).toBe(true);
  });

  it("excludes unavailable items from both the list and the total", () => {
    const items = [
      item({ productId: "ok", basePrice: 500, quantity: 2 }), // 1000, kept
      item({ productId: "inactive", basePrice: 900, isActive: false }),
      item({ productId: "oos", basePrice: 700, stockQuantity: 0 }),
    ];

    const available = availableBundleItems(items);
    expect(available.map((i) => i.productId)).toEqual(["ok"]);
    expect(bundleTotalPence(items)).toBe(1000);
  });

  it("carries a line total per available item", () => {
    const [line] = availableBundleItems([item({ basePrice: 250, quantity: 4 })]);
    expect(line.linePence).toBe(1000);
  });

  it("preserves the curated order of the available items", () => {
    const available = availableBundleItems([
      item({ productId: "first" }),
      item({ productId: "gone", stockQuantity: 0 }),
      item({ productId: "third" }),
    ]);
    expect(available.map((i) => i.productId)).toEqual(["first", "third"]);
  });
});

describe("hasAvailableItems", () => {
  it("is false for an empty bundle", () => {
    expect(hasAvailableItems([])).toBe(false);
  });

  it("is false when every constituent is unavailable", () => {
    expect(
      hasAvailableItems([item({ stockQuantity: 0 }), item({ productId: "b", isActive: false })]),
    ).toBe(false);
  });

  it("is true when at least one constituent survives", () => {
    expect(hasAvailableItems([item({ stockQuantity: 0 }), item({ productId: "b" })])).toBe(true);
  });
});
