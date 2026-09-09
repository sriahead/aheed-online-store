import { describe, it, expect } from "vitest";
import type { NetContent } from "@/components/product/unit-price";
import {
  comparePackSizes,
  deriveUnitPriceLabel,
  deriveUnitPricePenceForSort,
  formatPackSize,
  isNetContentUnit,
  packSizeParamValue,
  parsePackSizeParam,
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

/**
 * #397 — pack size as a FACET. Distinct from the unit-price functions above: those answer
 * "what does this cost per kg", this answers "how big is the pack".
 */

describe("formatPackSize (R6)", () => {
  it("suffixes each unit the way a shopper reads it", () => {
    expect(formatPackSize({ amount: 500, unit: "GRAM" })).toBe("500g");
    expect(formatPackSize({ amount: 1, unit: "KILOGRAM" })).toBe("1kg");
    expect(formatPackSize({ amount: 500, unit: "MILLILITRE" })).toBe("500ml");
    expect(formatPackSize({ amount: 1, unit: "LITRE" })).toBe("1L");
    expect(formatPackSize({ amount: 6, unit: "EACH" })).toBe("6 each");
  });

  it("round-trips through the query-string form", () => {
    const packSize = { amount: 500, unit: "GRAM" } as const;
    expect(packSizeParamValue(packSize)).toBe("500-GRAM");
    expect(parsePackSizeParam(packSizeParamValue(packSize))).toEqual(packSize);
  });
});

describe("parsePackSizeParam (R7)", () => {
  it("parses a well-formed value", () => {
    expect(parsePackSizeParam("500-GRAM")).toEqual({ amount: 500, unit: "GRAM" });
    expect(parsePackSizeParam("1-KILOGRAM")).toEqual({ amount: 1, unit: "KILOGRAM" });
  });

  /*
   * THE CASE THIS FUNCTION EXISTS FOR. A repeated query parameter (?packSize=a&packSize=b) is a
   * string[] at runtime whatever the page's searchParams type annotation says. #689 records five
   * existing keys that throw a real HTTP 500 on exactly that, because each calls a string method
   * on the array. This asserts the new key cannot become the sixth.
   */
  it("rejects an array, so a repeated query parameter applies no filter instead of throwing", () => {
    expect(parsePackSizeParam(["500-GRAM", "1-KILOGRAM"])).toBeUndefined();
    expect(parsePackSizeParam(["500-GRAM"])).toBeUndefined();
    expect(parsePackSizeParam([])).toBeUndefined();
  });

  it("rejects absent, malformed and out-of-range values", () => {
    expect(parsePackSizeParam(undefined)).toBeUndefined();
    expect(parsePackSizeParam("")).toBeUndefined();
    expect(parsePackSizeParam("500-TONNE")).toBeUndefined();
    expect(parsePackSizeParam("abc-GRAM")).toBeUndefined();
    expect(parsePackSizeParam("500")).toBeUndefined();
    expect(parsePackSizeParam("-GRAM")).toBeUndefined();
    expect(parsePackSizeParam("500-gram")).toBeUndefined();
    expect(parsePackSizeParam("bogus")).toBeUndefined();
  });

  it("rejects a zero amount, which passes a naive digit check but describes no pack", () => {
    expect(parsePackSizeParam("0-GRAM")).toBeUndefined();
  });
});

describe("comparePackSizes (R10)", () => {
  it("orders by real size within a unit family, not by raw amount", () => {
    // The whole point: 1 is a smaller NUMBER than 500 and a larger PACK.
    const sorted = (
      [
        { amount: 1, unit: "KILOGRAM" },
        { amount: 500, unit: "GRAM" },
        { amount: 250, unit: "GRAM" },
      ] satisfies NetContent[]
    )
      .sort(comparePackSizes)
      .map(formatPackSize);

    expect(sorted).toEqual(["250g", "500g", "1kg"]);
  });

  it("orders millilitres against litres the same way", () => {
    const sorted = (
      [
        { amount: 1, unit: "LITRE" },
        { amount: 500, unit: "MILLILITRE" },
      ] satisfies NetContent[]
    )
      .sort(comparePackSizes)
      .map(formatPackSize);

    expect(sorted).toEqual(["500ml", "1L"]);
  });

  it("groups unit families together rather than interleaving them", () => {
    const sorted = (
      [
        { amount: 1, unit: "LITRE" },
        { amount: 1, unit: "KILOGRAM" },
        { amount: 2, unit: "EACH" },
        { amount: 500, unit: "GRAM" },
        { amount: 500, unit: "MILLILITRE" },
      ] satisfies NetContent[]
    )
      .sort(comparePackSizes)
      .map(formatPackSize);

    // each < kg < litre by reference-unit label; smallest first inside each group.
    expect(sorted).toEqual(["2 each", "500g", "1kg", "500ml", "1L"]);
  });
});
