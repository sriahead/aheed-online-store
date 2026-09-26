import { describe, expect, it } from "vitest";
import { deliveryAreaExamples, exampleAreaFor } from "@/lib/delivery-area-examples";

/**
 * #905 R24 — delivery-area examples come from the vendor's own geography, never a fixed town.
 */

describe("exampleAreaFor (#905 R24)", () => {
  it("uses the store postcode's area first", () => {
    expect(exampleAreaFor({ storePostcode: "RG1 1AA", deliveryPrefixes: ["MK"] })).toBe("RG");
  });

  it("otherwise uses the alphabetically first delivery area's letters", () => {
    expect(exampleAreaFor({ storePostcode: null, deliveryPrefixes: ["RG1", "MK"] })).toBe("MK");
  });

  it("falls through an unparseable store postcode to the delivery areas", () => {
    expect(exampleAreaFor({ storePostcode: "not a postcode", deliveryPrefixes: ["RG1"] })).toBe(
      "RG",
    );
  });

  it("returns null with neither", () => {
    expect(exampleAreaFor({ storePostcode: null, deliveryPrefixes: [] })).toBeNull();
  });
});

describe("deliveryAreaExamples (#905 R24)", () => {
  it("builds the full example set for an area", () => {
    expect(deliveryAreaExamples("RG")).toEqual({
      area: "RG",
      district: "RG1",
      list: "RG1, RG3, RG5",
      range: "RG1-RG10",
    });
  });

  it("returns null for no area", () => {
    expect(deliveryAreaExamples(null)).toBeNull();
  });
});
