import { describe, expect, it } from "vitest";
import { searchPageHref } from "@/components/product/search-href";

/**
 * #501 — `/search` gained a browse mode and a `featured` param, so this builder
 * now carries eight params across a page boundary rather than seven. A param
 * dropped here is silent from the outside: the shopper clicks "Next page" and
 * lands on an unfiltered listing that looks perfectly normal.
 *
 * `featured` is the one most exposed, because unlike every other param it has
 * no visible control on the page to re-apply it from.
 */
describe("searchPageHref", () => {
  it("carries every set param plus the cursor", () => {
    const href = searchPageHref(
      {
        q: "rice",
        minPrice: "1.50",
        maxPrice: "9.99",
        inStock: "1",
        isHalal: "1",
        isFresh: "1",
        isOrganic: "1",
        featured: "1",
      },
      "cur-123",
    );

    const params = new URL(href, "https://example.test").searchParams;
    expect(params.get("q")).toBe("rice");
    expect(params.get("minPrice")).toBe("1.50");
    expect(params.get("maxPrice")).toBe("9.99");
    expect(params.get("inStock")).toBe("1");
    expect(params.get("isHalal")).toBe("1");
    expect(params.get("isFresh")).toBe("1");
    expect(params.get("isOrganic")).toBe("1");
    expect(params.get("featured")).toBe("1");
    expect(params.get("cursor")).toBe("cur-123");
  });

  it("omits every unset param, leaving only the cursor", () => {
    expect(searchPageHref({}, "cur-1")).toBe("/search?cursor=cur-1");
  });

  it("omits params that are set but empty", () => {
    const href = searchPageHref({ q: "", minPrice: "", featured: "" }, "cur-1");
    expect(href).toBe("/search?cursor=cur-1");
  });

  it("carries featured on its own, with no query — the browse-mode case", () => {
    const href = searchPageHref({ featured: "1" }, "cur-9");
    const params = new URL(href, "https://example.test").searchParams;
    expect(params.get("featured")).toBe("1");
    expect(params.get("q")).toBeNull();
    expect(params.get("cursor")).toBe("cur-9");
  });

  it("takes the cursor from the argument, never from the params", () => {
    const href = searchPageHref({ q: "rice" }, "the-new-one");
    expect(new URL(href, "https://example.test").searchParams.get("cursor")).toBe("the-new-one");
  });

  it("percent-encodes a query containing spaces and symbols", () => {
    const href = searchPageHref({ q: "basmati rice & dal" }, "c");
    expect(new URL(href, "https://example.test").searchParams.get("q")).toBe("basmati rice & dal");
  });
});
