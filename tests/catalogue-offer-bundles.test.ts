import { describe, it, expect } from "vitest";
import { referencedProducts, validate, type OfferData } from "@/scripts/catalogue-offer-bundles";

const base: OfferData = {
  bundles: [
    { slug: "four-medium", name: "4 Medium", items: [{ product: "Medium Chicken", quantity: 4 }] },
    {
      slug: "feast",
      name: "Feast",
      items: [
        { product: "Chicken Breast", quantity: 3 },
        { product: "Medium Chicken", quantity: 4 },
      ],
    },
  ],
  promotions: [{ headline: "Multi-Buy", bundle: "four-medium" }],
  offerType: {
    name: "Offer Type",
    slug: "offer-type",
    options: [],
    boxOfferProducts: ["Croaker – Box"],
  },
};

describe("#1517 offer bundle data checks", () => {
  it("accepts a consistent file and lists each referenced product once", () => {
    expect(validate(base)).toEqual([]);
    expect(referencedProducts(base).sort()).toEqual([
      "Chicken Breast",
      "Croaker – Box",
      "Medium Chicken",
    ]);
  });

  it("rejects a duplicate slug, an empty bundle, a zero quantity and a promotion for an unknown bundle", () => {
    const bad: OfferData = {
      ...base,
      bundles: [
        ...base.bundles,
        { slug: "feast", name: "Again", items: [] },
        { slug: "zero", name: "Zero", items: [{ product: "Medium Chicken", quantity: 0 }] },
      ],
      promotions: [{ headline: "Lost", bundle: "nope" }],
    };
    const problems = validate(bad);
    expect(problems).toContain("a bundle slug appears twice");
    expect(problems).toContain("bundle feast has no items");
    expect(problems).toContain("bundle zero: Medium Chicken quantity < 1");
    expect(problems).toContain('promotion "Lost" names unknown bundle nope');
  });
});
