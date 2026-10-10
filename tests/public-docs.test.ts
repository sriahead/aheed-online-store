import { describe, expect, it } from "vitest";
import { getPublicShopperGuide, SHOPPER_GUIDE_ID } from "@/lib/public-docs";

/**
 * #1022 — the public Help Centre's guide is selected by id and only when it is public.
 *
 * The crafted lists reproduce the shape of the original defect: an internal article that lists
 * `shopper` in its audience, sorted ahead of the guide.
 */

const internalShopperArticle = {
  id: "docs/operations-research/order-fulfilment-core.md",
  title: "Order & Fulfilment Operations",
  audience: ["staff", "shopper"],
  visibility: "internal",
  content: "PENDING_PAYMENT — Known Trap",
};

const publicGuide = {
  id: SHOPPER_GUIDE_ID,
  title: "Shopping guide",
  audience: ["shopper"],
  visibility: "public",
  content: "Guest Checkout",
};

describe("getPublicShopperGuide (#1022)", () => {
  it("returns the public shopping guide from the real generated corpus", () => {
    const guide = getPublicShopperGuide();
    expect(guide?.id).toBe("docs/shopper-help/shopping-guide.md");
    expect(guide?.visibility).toBe("public");
  }, 60_000);

  it("returns the guide, not an internal shopper-audience article that sorts first", () => {
    expect(getPublicShopperGuide([internalShopperArticle, publicGuide])).toBe(publicGuide);
  });

  it("returns null when the guide itself is marked internal", () => {
    expect(
      getPublicShopperGuide([internalShopperArticle, { ...publicGuide, visibility: "internal" }]),
    ).toBeNull();
  });

  it("returns null when the guide is absent, even if another public shopper article exists", () => {
    const otherPublic = { ...publicGuide, id: "docs/shopper-help/other.md" };
    expect(getPublicShopperGuide([internalShopperArticle, otherPublic])).toBeNull();
  });
});
