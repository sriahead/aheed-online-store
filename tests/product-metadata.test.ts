import { afterEach, describe, expect, it, vi } from "vitest";
import { getProductMetadataService, isRelevantMatch } from "@/lib/product-metadata";

/**
 * #502 — Open Food Facts' top hit is not necessarily this product's photo.
 *
 * `fetchImageUrl` asks for `page_size=1` and used to return `products[0]`
 * unconditionally. Open Food Facts ranks on keyword overlap, so every generated
 * product whose name contains "Paneer" resolved to the SAME top hit and every
 * one of them was given the identical image — the "we are not getting the image
 * we expect and it keeps repeating" this slice was opened for.
 *
 * The rule is deliberately a floor, not a judgement of which of two plausible
 * hits is better: one shared significant token passes. These cases pin the two
 * ends of that — an unrelated product is refused, a differently-branded version
 * of the same product is accepted.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isRelevantMatch", () => {
  it("rejects a hit sharing no significant token", () => {
    expect(isRelevantMatch("Golden Paneer 500g", "Coca-Cola Zero")).toBe(false);
  });

  it("accepts a differently-branded version of the same product", () => {
    expect(isRelevantMatch("Golden Paneer 500g", "Amul Malai Paneer")).toBe(true);
  });

  it("does not match on a marketing adjective alone", () => {
    // Both names carry "Premium", and nothing else in common. Matching on that
    // is exactly how one hit ends up on dozens of unrelated products.
    expect(isRelevantMatch("Premium Rice 2kg", "Premium Dog Food")).toBe(false);
  });

  it("does not match on a size alone", () => {
    expect(isRelevantMatch("Everyday Ghee 5kg", "Washing Powder 5kg")).toBe(false);
  });

  it("refuses a product name with no significant token of its own", () => {
    // Nothing to match on means nothing can honestly be claimed to match.
    expect(isRelevantMatch("Extra 500g", "Anything At All")).toBe(false);
  });
});

describe("fetchImageUrl text search", () => {
  function stubSearch(productName: string, imageUrl: string | undefined) {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ products: [{ product_name: productName, image_url: imageUrl }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns null when the top hit is unrelated", async () => {
    stubSearch("Coca-Cola Zero", "https://images.openfoodfacts.org/cola.jpg");
    const url = await getProductMetadataService().fetchImageUrl("Golden Paneer 500g");
    expect(url).toBeNull();
  });

  it("returns the image url when the top hit is relevant", async () => {
    stubSearch("Amul Malai Paneer", "https://images.openfoodfacts.org/paneer.jpg");
    const url = await getProductMetadataService().fetchImageUrl("Golden Paneer 500g");
    expect(url).toBe("https://images.openfoodfacts.org/paneer.jpg");
  });

  it("returns null when a relevant hit carries no image", async () => {
    stubSearch("Amul Malai Paneer", undefined);
    const url = await getProductMetadataService().fetchImageUrl("Golden Paneer 500g");
    expect(url).toBeNull();
  });
});
