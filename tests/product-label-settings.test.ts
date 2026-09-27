import { describe, expect, it } from "vitest";
import {
  applyProductLabelSettings,
  labelSettingsFromProfile,
  type ProductLabelSettings,
} from "@/lib/product-label-settings";
import type { ProductWriteInput } from "@/lib/repositories/products";

/**
 * #905 R12 — a label a vendor has switched off is stripped from the product write (so an update
 * leaves the stored value alone), never saved as false.
 */

const VERIFIED = new Date("2026-09-01T00:00:00.000Z");

const VALUES: ProductWriteInput = {
  name: "Product",
  slug: "product",
  description: "",
  categoryId: "cat",
  basePrice: 100,
  originalPrice: null,
  unitLabel: "each",
  netContentAmount: null,
  netContentUnit: null,
  origin: null,
  isHalal: true,
  isFresh: false,
  isOrganic: true,
  isVegetarian: true,
  isGlutenFree: false,
  isHmcCertified: true,
  hmcReference: "HMC/1",
  hmcVerifiedAt: VERIFIED,
  brandId: null,
  isFeatured: false,
  isActive: true,
  quantity: 1,
  lowStockThreshold: 0,
  expectedRestockDay: null,
  tier: null,
  attributeValues: [],
};

const ALL_ON: ProductLabelSettings = {
  halal: true,
  fresh: true,
  organic: true,
  vegetarian: true,
  glutenFree: true,
  hmc: true,
};

describe("applyProductLabelSettings (#905 R12)", () => {
  it("(a) with every label on, the values come back unchanged", () => {
    expect(applyProductLabelSettings(VALUES, ALL_ON)).toEqual(VALUES);
  });

  it("(b) a disabled label is undefined even when the input carried true (a crafted field)", () => {
    const result = applyProductLabelSettings(VALUES, { ...ALL_ON, organic: false });
    expect(result.isOrganic).toBeUndefined();
    expect(result).toEqual({ ...VALUES, isOrganic: undefined });
  });

  it("(c) HMC off strips all three HMC fields and nothing else", () => {
    const result = applyProductLabelSettings(VALUES, { ...ALL_ON, hmc: false });
    expect(result.isHmcCertified).toBeUndefined();
    expect(result.hmcReference).toBeUndefined();
    expect(result.hmcVerifiedAt).toBeUndefined();
    expect(result.isHalal).toBe(true);
  });

  it("strips every label field with every label off, leaving non-label fields alone", () => {
    const none: ProductLabelSettings = {
      halal: false,
      fresh: false,
      organic: false,
      vegetarian: false,
      glutenFree: false,
      hmc: false,
    };
    const result = applyProductLabelSettings(VALUES, none);
    for (const key of [
      "isHalal",
      "isFresh",
      "isOrganic",
      "isVegetarian",
      "isGlutenFree",
      "isHmcCertified",
      "hmcReference",
      "hmcVerifiedAt",
    ] as const) {
      expect(result[key]).toBeUndefined();
    }
    expect(result.isFeatured).toBe(false);
    expect(result.isActive).toBe(true);
    expect(result.name).toBe("Product");
  });
});

describe("labelSettingsFromProfile (#905 R12)", () => {
  const profile = {
    showHalalLabel: true,
    showFreshLabel: false,
    showOrganicLabel: true,
    showVegetarianLabel: false,
    showGlutenFreeLabel: true,
    showHmcCertification: true,
  };

  it("maps each setting onto its label", () => {
    expect(labelSettingsFromProfile(profile)).toEqual({
      halal: true,
      fresh: false,
      organic: true,
      vegetarian: false,
      glutenFree: true,
      hmc: true,
    });
  });

  it("(d) HMC is not shown when Halal is off, even if HMC certification is on", () => {
    expect(labelSettingsFromProfile({ ...profile, showHalalLabel: false }).hmc).toBe(false);
  });
});
