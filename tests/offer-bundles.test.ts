import { describe, it, expect } from "vitest";
import {
  bundleRegularPence,
  bundleSavingPence,
  bundleTotalPence,
  type BundleItemInput,
} from "@/lib/bundle-pricing";
import { promotionBundleTotalPence, promotionHref, promotionLabel } from "@/lib/promotion-cta";
import { tieredLineTotalPence } from "@/lib/tier-pricing";

const tier = (groupQuantity: number, groupPricePence: number, isActive = true) => ({
  groupQuantity,
  groupPricePence,
  isActive,
});

function item(over: Partial<BundleItemInput>): BundleItemInput {
  return {
    productId: "p",
    slug: "p",
    name: "P",
    unitLabel: "£5.00",
    basePrice: 500,
    originalPrice: null,
    quantity: 1,
    isActive: true,
    stockQuantity: 99,
    ...over,
  };
}

describe("#1517 R1/R2 — bundle totals use the multi-buy tier, exactly as the cart does", () => {
  it("4 × a '4 for £18' product totals £18, normal £20, saving £2", () => {
    const items = [item({ quantity: 4, tier: tier(4, 1800) })];
    expect(bundleTotalPence(items)).toBe(1800);
    expect(bundleRegularPence(items)).toBe(2000);
    expect(bundleSavingPence(items)).toBe(200);
  });

  it("matches the cart's own function line by line, including remainders", () => {
    const items = [
      item({ productId: "a", quantity: 7, basePrice: 400, tier: tier(3, 1000) }),
      item({ productId: "b", quantity: 2, basePrice: 250 }),
    ];
    expect(bundleTotalPence(items)).toBe(
      tieredLineTotalPence(400, 7, tier(3, 1000)) + tieredLineTotalPence(250, 2, null),
    );
  });

  it("is unchanged with no tier, an inactive tier, or a quantity below the group", () => {
    expect(bundleTotalPence([item({ quantity: 3 })])).toBe(1500);
    expect(bundleTotalPence([item({ quantity: 4, tier: tier(4, 1800, false) })])).toBe(2000);
    expect(bundleTotalPence([item({ quantity: 3, tier: tier(4, 1800) })])).toBe(1500);
    expect(bundleSavingPence([item({ quantity: 3 })])).toBe(0);
  });

  it("ignores unavailable constituents in all three figures", () => {
    const items = [
      item({ productId: "a", quantity: 4, tier: tier(4, 1800) }),
      item({ productId: "b", quantity: 1, isActive: false }),
    ];
    expect([bundleTotalPence(items), bundleRegularPence(items)]).toEqual([1800, 2000]);
  });
});

describe("#1517 R7 — a bundle promotion lands on the bundle page", () => {
  const bundle = {
    slug: "four-medium-chickens",
    items: [{ quantity: 4, product: { basePrice: 500, priceTier: tier(4, 1800) } }],
  };

  it("links to /bundles/<slug> labelled Buy This Offer, priced with the tier", () => {
    const promo = { linkUrl: null, callToActionText: null, bundle };
    expect(promotionHref(promo)).toBe("/bundles/four-medium-chickens");
    expect(promotionLabel(promo)).toBe("Buy This Offer");
    expect(promotionBundleTotalPence(promo)).toBe(1800);
  });

  it("prefers the bundle over a category; an explicit link or label wins over both", () => {
    const category = { name: "Chicken", slug: "chicken-poultry" };
    expect(promotionHref({ linkUrl: null, callToActionText: null, bundle, category })).toBe(
      "/bundles/four-medium-chickens",
    );
    expect(
      promotionHref({ linkUrl: "/whatsapp-offers", callToActionText: "Join", bundle, category }),
    ).toBe("/whatsapp-offers");
    expect(promotionLabel({ linkUrl: null, callToActionText: "Grab it", bundle })).toBe("Grab it");
  });

  it("keeps the old behaviour for category, discount-code and plain promotions", () => {
    expect(
      promotionHref({
        linkUrl: null,
        callToActionText: null,
        category: { name: "Fish", slug: "fish" },
      }),
    ).toBe("/categories/fish");
    expect(
      promotionLabel({ linkUrl: null, callToActionText: null, discountCode: { code: "X" } }),
    ).toBe("Shop with Code");
    expect(promotionHref({ linkUrl: null, callToActionText: null })).toBe("/categories");
    expect(promotionBundleTotalPence({ linkUrl: null, callToActionText: null })).toBeNull();
  });
});
