import { describe, expect, it } from "vitest";
import {
  encodeDeliveryQuote,
  quoteMatches,
  resolveDeliveryRules,
  type DeliveryAreaCharges,
} from "@/lib/delivery-pricing";

/**
 * #890 R18/R19 — per-area delivery money resolution. A district row beats an area row; each field
 * falls back to the vendor default independently; Click & Collect and an unknown postcode always
 * get the defaults.
 */

const DEFAULTS = { deliveryFeePence: 349, minimumOrderPence: 0, freeDeliveryThresholdPence: 4000 };

function row(prefix: string, overrides: Partial<Omit<DeliveryAreaCharges, "prefix">> = {}) {
  return {
    prefix,
    deliveryFeePence: null,
    minimumOrderPence: null,
    freeDeliveryThresholdPence: null,
    ...overrides,
  };
}

const AREAS = [
  row("MK"),
  row("MK17", { deliveryFeePence: 599, minimumOrderPence: 2500, freeDeliveryThresholdPence: 0 }),
];

describe("resolveDeliveryRules (#890 R19)", () => {
  it("an area row with no overrides yields the vendor defaults, naming the area", () => {
    expect(resolveDeliveryRules(DEFAULTS, AREAS, "MK9 2EA", "DELIVERY")).toEqual({
      deliveryFeePence: 349,
      minimumOrderPence: 0,
      freeDeliveryThresholdPence: 4000,
      areaPrefix: "MK",
    });
  });

  it("a district row's overrides beat the area row", () => {
    expect(resolveDeliveryRules(DEFAULTS, AREAS, "MK17 8NL", "DELIVERY")).toEqual({
      deliveryFeePence: 599,
      minimumOrderPence: 2500,
      freeDeliveryThresholdPence: 0,
      areaPrefix: "MK17",
    });
  });

  it("Click & Collect always resolves to the vendor defaults", () => {
    expect(resolveDeliveryRules(DEFAULTS, AREAS, "MK17 8NL", "COLLECTION")).toEqual({
      ...DEFAULTS,
      areaPrefix: null,
    });
  });

  it("no postcode resolves to the vendor defaults", () => {
    expect(resolveDeliveryRules(DEFAULTS, AREAS, null, "DELIVERY")).toEqual({
      ...DEFAULTS,
      areaPrefix: null,
    });
    expect(resolveDeliveryRules(DEFAULTS, AREAS, "", "DELIVERY").areaPrefix).toBeNull();
  });

  it("each field inherits independently", () => {
    const areas = [row("MK"), row("MK17", { deliveryFeePence: 599 })];
    expect(resolveDeliveryRules(DEFAULTS, areas, "MK17 8NL", "DELIVERY")).toEqual({
      deliveryFeePence: 599,
      minimumOrderPence: 0,
      freeDeliveryThresholdPence: 4000,
      areaPrefix: "MK17",
    });
  });

  it("a postcode no row covers resolves to the defaults", () => {
    expect(
      resolveDeliveryRules(DEFAULTS, [row("RG")], "MK9 2EA", "DELIVERY").areaPrefix,
    ).toBeNull();
  });
});

describe("delivery quote (#890 R23)", () => {
  it("round-trips, with an empty threshold for null", () => {
    expect(encodeDeliveryQuote(DEFAULTS)).toBe("349:0:4000");
    expect(encodeDeliveryQuote({ ...DEFAULTS, freeDeliveryThresholdPence: null })).toBe("349:0:");
    expect(quoteMatches("349:0:4000", DEFAULTS)).toBe(true);
  });

  it("rejects a different, missing or malformed quote", () => {
    expect(quoteMatches("599:2500:0", DEFAULTS)).toBe(false);
    expect(quoteMatches(null, DEFAULTS)).toBe(false);
    expect(quoteMatches("", DEFAULTS)).toBe(false);
    expect(quoteMatches("349;0;4000", DEFAULTS)).toBe(false);
  });
});
