import { describe, it, expect } from "vitest";
import {
  deriveUnitPriceLabel,
  deriveUnitPricePenceForSort,
  isNetContentUnit,
} from "@/components/product/unit-price";

/**
 * #398 (derivation half, P9.3), R32 — the pure function the DISPLAYED unit price is derived
 * from, and its sort-key counterpart. No DB import anywhere in this file or the module it tests.
 */

describe("deriveUnitPriceLabel", () => {
  it("derives a whole-kilogram unit price", () => {
    // £5.00 for 2kg -> £2.50 / kg, an exact whole number of pence.
    expect(deriveUnitPriceLabel(500, { amount: 2, unit: "KILOGRAM" })).toBe("£2.50 / kg");
  });

  it("derives a sub-kilogram unit price whose exact pence value is NOT whole", () => {
    // £1.00 for 300g -> £1.00 / 0.3kg = 333.33...p/kg, which formatPrice rounds for display —
    // this is exactly the rounding R32 says must never be read back from a stored column.
    expect(deriveUnitPriceLabel(100, { amount: 300, unit: "GRAM" })).toBe("£3.33 / kg");
  });

  it("derives a countable/EACH unit price", () => {
    // £1.80 for a 6-pack -> £0.30 / each.
    expect(deriveUnitPriceLabel(180, { amount: 6, unit: "EACH" })).toBe("£0.30 / each");
  });

  it("derives a litre-based unit price for MILLILITRE", () => {
    expect(deriveUnitPriceLabel(150, { amount: 500, unit: "MILLILITRE" })).toBe("£3.00 / litre");
  });

  it("returns null when there is no net content, so the caller falls back to unitLabel", () => {
    expect(deriveUnitPriceLabel(450, null)).toBeNull();
  });

  it("returns null for a non-positive amount rather than dividing by zero", () => {
    expect(deriveUnitPriceLabel(450, { amount: 0, unit: "KILOGRAM" })).toBeNull();
  });
});

describe("deriveUnitPricePenceForSort", () => {
  it("rounds the sub-kilogram case's exact pence value to a whole pence for storage", () => {
    // Same £1.00 / 300g case as above: 333.33...p rounds to 333.
    expect(deriveUnitPricePenceForSort(100, { amount: 300, unit: "GRAM" })).toBe(333);
  });

  it("matches the whole-kilogram case exactly", () => {
    expect(deriveUnitPricePenceForSort(500, { amount: 2, unit: "KILOGRAM" })).toBe(250);
  });

  it("returns null when there is no net content", () => {
    expect(deriveUnitPricePenceForSort(450, null)).toBeNull();
  });
});

describe("isNetContentUnit", () => {
  it("accepts every declared member", () => {
    for (const unit of ["GRAM", "KILOGRAM", "MILLILITRE", "LITRE", "EACH"]) {
      expect(isNetContentUnit(unit)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isNetContentUnit("POUND")).toBe(false);
    expect(isNetContentUnit("")).toBe(false);
  });
});
