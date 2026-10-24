import { describe, it, expect } from "vitest";
import {
  MAX_ADD_QUANTITY,
  isStockMode,
  purchasableQuantity,
  stockModeOf,
  type ProductRestriction,
  type StockInput,
} from "@/lib/cart-rules";

/**
 * #1211 (R6) — THE purchasability rule, one row per case in requirements.md R6. The cart,
 * checkout, bundles, the storefront mappers and placeOrder all call this function and nothing
 * else (tests/purchasability-single-source.test.ts), so these rows are the whole contract.
 */

const live = (inventory: StockInput, restriction: ProductRestriction | null = null) => ({
  isActive: true,
  restriction,
  inventory,
});

describe("purchasableQuantity — stock states (ADR-007 Decision 4)", () => {
  it.each<[string, StockInput, number]>([
    ["no Inventory row (null) is UNKNOWN: blocked", null, 0],
    ["no Inventory row (undefined) is UNKNOWN: blocked", undefined, 0],
    [
      "UNKNOWN with a positive quantity is still blocked",
      { stockMode: "UNKNOWN", quantity: 50 },
      0,
    ],
    ["TRACKED above zero: the quantity", { stockMode: "TRACKED", quantity: 7 }, 7],
    ["TRACKED at zero: blocked", { stockMode: "TRACKED", quantity: 0 }, 0],
    ["TRACKED below zero: blocked, never negative", { stockMode: "TRACKED", quantity: -3 }, 0],
    [
      "UNTRACKED: the per-line cap, quantity ignored",
      { stockMode: "UNTRACKED", quantity: 0 },
      MAX_ADD_QUANTITY,
    ],
    [
      "UNTRACKED with a negative quantity: still the cap",
      { stockMode: "UNTRACKED", quantity: -5 },
      99,
    ],
  ])("%s", (_label, inventory, expected) => {
    expect(purchasableQuantity(live(inventory))).toBe(expected);
  });
});

describe("purchasableQuantity — eligibility beats stock", () => {
  const plenty: StockInput = { stockMode: "TRACKED", quantity: 40 };
  const untracked: StockInput = { stockMode: "UNTRACKED", quantity: 0 };

  it("an inactive product is never purchasable, whatever its stock", () => {
    expect(purchasableQuantity({ isActive: false, restriction: null, inventory: plenty })).toBe(0);
    expect(purchasableQuantity({ isActive: false, restriction: null, inventory: untracked })).toBe(
      0,
    );
  });

  it.each<ProductRestriction>(["PROHIBITED", "AGE_RESTRICTED", "NOT_DELIVERABLE", "NEEDS_REVIEW"])(
    "a %s product is never purchasable, even if forced active with stock",
    (restriction) => {
      expect(purchasableQuantity(live(plenty, restriction))).toBe(0);
      expect(purchasableQuantity(live(untracked, restriction))).toBe(0);
    },
  );
});

describe("stockModeOf / isStockMode", () => {
  it("reads a missing row as UNKNOWN", () => {
    expect(stockModeOf(null)).toBe("UNKNOWN");
    expect(stockModeOf(undefined)).toBe("UNKNOWN");
    expect(stockModeOf({ stockMode: "UNTRACKED", quantity: 0 })).toBe("UNTRACKED");
  });

  it("accepts exactly the three modes", () => {
    expect(["TRACKED", "UNTRACKED", "UNKNOWN"].every(isStockMode)).toBe(true);
    expect(isStockMode("FOO")).toBe(false);
    expect(isStockMode("tracked")).toBe(false);
    expect(isStockMode(undefined)).toBe(false);
  });
});
