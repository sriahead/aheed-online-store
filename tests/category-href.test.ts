import { describe, expect, it } from "vitest";
import { categoryNavHref } from "@/components/product/category-href";

describe("categoryNavHref", () => {
  it("builds a clean URL when no filters or sort are set", () => {
    expect(categoryNavHref("halal-meat", {})).toBe("/categories/halal-meat");
  });

  it("carries all active dietary, stock, and price filters across category navigation", () => {
    const params = {
      isHalal: "1",
      inStock: "1",
      minPrice: "2.50",
      maxPrice: "10.00",
      origin: "United Kingdom",
      brand: "shan",
    };
    const href = categoryNavHref("chicken-poultry", params);
    expect(href).toContain("/categories/chicken-poultry?");
    expect(href).toContain("isHalal=1");
    expect(href).toContain("inStock=1");
    expect(href).toContain("minPrice=2.50");
    expect(href).toContain("maxPrice=10.00");
    expect(href).toContain("origin=United+Kingdom");
    expect(href).toContain("brand=shan");
  });

  it("preserves sort order when switching categories", () => {
    const href = categoryNavHref("lamb-mutton", {
      sort: "unit_price_asc",
      isHalal: "1",
    });
    expect(href).toContain("sort=unit_price_asc");
    expect(href).toContain("isHalal=1");
  });

  it("drops pagination cursor and back stack so new category starts at page 1", () => {
    const href = categoryNavHref("beef-mince", {
      cursor: "cursor-12345",
      back: "page1,page2",
      inStock: "1",
      sort: "price_asc",
    });
    expect(href).not.toContain("cursor=");
    expect(href).not.toContain("back=");
    expect(href).toContain("inStock=1");
    expect(href).toContain("sort=price_asc");
  });

  it("carries vendor-defined attr_* filters", () => {
    const href = categoryNavHref("electronics", {
      attr_colour: "black",
      attr_length_min: "1",
      attr_length_max: "5",
    });
    expect(href).toContain("attr_colour=black");
    expect(href).toContain("attr_length_min=1");
    expect(href).toContain("attr_length_max=5");
  });
});
