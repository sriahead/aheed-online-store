import { describe, it, expect } from "vitest";
import { priceLabel, significantWords, wordSet } from "@/scripts/catalogue-load-price-list";

describe("#1330 price list loader helpers", () => {
  it("matches names as word sets: case, punctuation and order do not matter", () => {
    expect(wordSet("Royal Squid")).toBe(wordSet("SQUID ROYAL"));
    expect(wordSet("Garlic – 40s")).toBe(wordSet("GARLIC 40S"));
    expect(wordSet("Medium Chicken (1100–1200g)")).not.toBe(wordSet("MEDIUM CHICKEN"));
  });

  it("near-miss hints use meaningful words only", () => {
    expect(significantWords("Squid Rings – 1kg")).toEqual(["RINGS", "SQUID"]);
    expect(significantWords("Cow Feet – 800g Bag")).toEqual(["COW", "FEET"]);
  });

  it("formats the price label like the existing catalogue", () => {
    expect(priceLabel(500, "each")).toBe("£5.00");
    expect(priceLabel(740, "kg")).toBe("£7.40 / kg");
    expect(priceLabel(0, "each")).toBe("£0.00");
  });
});
