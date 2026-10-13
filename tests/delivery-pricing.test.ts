import { describe, expect, it } from "vitest";
import {
  encodeDeliveryQuote,
  quoteMatches,
  resolveDeliveryRules,
  type DeliveryAreaCharges,
} from "@/lib/delivery-pricing";

/**
 * #890 R18/R19 — per-area delivery money resolution. A district row beats an area row; each field
 * falls back to the vendor default independently; an unknown postcode always gets the defaults.
 * Click & Collect gets the defaults too, except its minimum (#1083 R4/R5).
 */

/** The three delivery-money fields, as a quote carries them. */
const MONEY = { deliveryFeePence: 349, minimumOrderPence: 0, freeDeliveryThresholdPence: 4000 };
const DEFAULTS = { ...MONEY, collectionMinimumOrderPence: 0 };

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

  it("Click & Collect resolves to the vendor defaults, never an area's overrides", () => {
    expect(resolveDeliveryRules(DEFAULTS, AREAS, "MK17 8NL", "COLLECTION")).toEqual({
      ...MONEY,
      areaPrefix: null,
    });
  });

  it("no postcode resolves to the vendor defaults", () => {
    expect(resolveDeliveryRules(DEFAULTS, AREAS, null, "DELIVERY")).toEqual({
      ...MONEY,
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

describe("Click & Collect's own minimum (#1083 R5)", () => {
  it("a £15 delivery minimum does not apply to collection when the collection minimum is 0", () => {
    const vendor = { ...MONEY, minimumOrderPence: 1500, collectionMinimumOrderPence: 0 };
    expect(resolveDeliveryRules(vendor, AREAS, null, "COLLECTION").minimumOrderPence).toBe(0);
    expect(resolveDeliveryRules(vendor, AREAS, null, "DELIVERY").minimumOrderPence).toBe(1500);
  });

  it("collection keeps its own minimum even where an area overrides the delivery minimum", () => {
    const vendor = { ...MONEY, minimumOrderPence: 1500, collectionMinimumOrderPence: 500 };
    const collection = resolveDeliveryRules(vendor, AREAS, "MK17 8NL", "COLLECTION");
    expect(collection.minimumOrderPence).toBe(500);
    expect(collection.areaPrefix).toBeNull();
    expect(resolveDeliveryRules(vendor, AREAS, "MK17 8NL", "DELIVERY").minimumOrderPence).toBe(
      2500,
    );
  });
});

describe("delivery quote (#890 R23)", () => {
  it("round-trips, with an empty threshold for null", () => {
    expect(encodeDeliveryQuote(MONEY)).toBe("349:0:4000");
    expect(encodeDeliveryQuote({ ...MONEY, freeDeliveryThresholdPence: null })).toBe("349:0:");
    expect(quoteMatches("349:0:4000", MONEY)).toBe(true);
  });

  it("rejects a different, missing or malformed quote", () => {
    expect(quoteMatches("599:2500:0", DEFAULTS)).toBe(false);
    expect(quoteMatches(null, DEFAULTS)).toBe(false);
    expect(quoteMatches("", DEFAULTS)).toBe(false);
    expect(quoteMatches("349;0;4000", DEFAULTS)).toBe(false);
  });
});
