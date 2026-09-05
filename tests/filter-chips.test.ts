import { describe, expect, it } from "vitest";
import {
  activeFilterChips,
  clearAllHref,
  type FilterChipParams,
  REMOVABLE,
} from "@/components/product/filter-chips";
import { CARRIED } from "@/components/product/search-href";

/**
 * P2.6 slice 5 (#568), R6-R9.
 *
 * Pure-function tests rather than rendered ones, because what can actually go wrong here is a
 * DROPPED parameter, and that is invisible in a rendered chip: the chip looks identical whether its
 * href preserves the other filters or silently discards them. The failure only shows up one click
 * later, on a listing that no longer matches what the shopper filtered.
 */

const ALL: FilterChipParams = {
  q: "rice",
  minPrice: "2",
  maxPrice: "10",
  inStock: "1",
  isHalal: "1",
  isFresh: "1",
  isOrganic: "1",
  featured: "1",
  category: "world-foods",
  cursor: "24",
  back: ",12",
};

function paramsOf(href: string): URLSearchParams {
  return new URLSearchParams(href.split("?")[1] ?? "");
}

describe("activeFilterChips (R6, R7)", () => {
  it("returns one chip per active filter, and never one for q", () => {
    const keys = activeFilterChips("/search", ALL, "World Foods").map((c) => c.key);

    expect(keys).toEqual([
      "category",
      "inStock",
      "isHalal",
      "isFresh",
      "isOrganic",
      "featured",
      "minPrice",
      "maxPrice",
    ]);
    expect(keys).not.toContain("q");
  });

  it("omits only its own key, preserves q and every other filter, and drops pagination", () => {
    for (const chip of activeFilterChips("/search", ALL, "World Foods")) {
      const qs = paramsOf(chip.href);

      expect(qs.has(chip.key), `${chip.key} should be removed by its own chip`).toBe(false);
      expect(qs.get("q")).toBe("rice");
      expect(qs.has("cursor"), "cursor must not survive a filter change").toBe(false);
      expect(qs.has("back"), "back must not survive a filter change").toBe(false);

      // Every OTHER filter still present.
      for (const other of ["category", "inStock", "isHalal", "isFresh", "isOrganic", "featured"]) {
        if (other === chip.key) continue;
        expect(qs.get(other), `${chip.key}'s href dropped ${other}`).not.toBeNull();
      }
    }
  });

  it("labels the category chip with the resolved name, not the slug", () => {
    const chip = activeFilterChips("/search", { category: "world-foods" }, "World Foods").find(
      (c) => c.key === "category",
    );
    expect(chip?.label).toBe("World Foods");
  });

  it("formats price chips in pounds", () => {
    const chips = activeFilterChips("/search", { minPrice: "2", maxPrice: "10.5" });
    expect(chips.map((c) => c.label)).toEqual(["From £2.00", "Up to £10.50"]);
  });

  /**
   * A price param that applies no filter must render no chip. `parsePriceInput` returns undefined
   * for blank, non-numeric or negative input, so `?minPrice=abc` reaches the page and narrows
   * nothing — a chip there would claim a filter the shopper can see no effect from and cannot
   * meaningfully remove.
   */
  it("renders no chip for a price value that applies no filter", () => {
    expect(activeFilterChips("/search", { minPrice: "abc" })).toEqual([]);
    expect(activeFilterChips("/search", { maxPrice: "-5" })).toEqual([]);
  });

  it("uses the base path it was given, so both browse pages work (R6)", () => {
    const chips = activeFilterChips("/categories/rice", { inStock: "1", isHalal: "1" });
    expect(chips.map((c) => c.href)).toEqual([
      "/categories/rice?isHalal=1",
      "/categories/rice?inStock=1",
    ]);
  });

  // Removing the ONLY filter leaves nothing to carry, so the href is the bare path rather than a
  // dangling "?" — same shape `clearAllHref` produces in that case.
  it("returns a bare path when removing the last remaining filter", () => {
    const chip = activeFilterChips("/categories/rice", { inStock: "1" })[0];
    expect(chip.href).toBe("/categories/rice");
  });
});

describe("activeFilterChips with nothing applied (R9)", () => {
  it("returns an empty array", () => {
    expect(activeFilterChips("/search", {})).toEqual([]);
    // A query alone is not a filter, so it produces no chips either.
    expect(activeFilterChips("/search", { q: "rice" })).toEqual([]);
    // Nor is pagination.
    expect(activeFilterChips("/search", { q: "rice", cursor: "24", back: ",12" })).toEqual([]);
  });
});

describe("clearAllHref (R8)", () => {
  it("keeps q and drops every filter and both pagination keys", () => {
    const qs = paramsOf(clearAllHref("/search", ALL));

    expect(qs.get("q")).toBe("rice");
    for (const key of [
      "minPrice",
      "maxPrice",
      "inStock",
      "isHalal",
      "isFresh",
      "isOrganic",
      "featured",
      "category",
      "cursor",
      "back",
    ]) {
      expect(qs.has(key), `${key} survived clear-all`).toBe(false);
    }
  });

  it("returns a bare path when there is nothing left to carry", () => {
    expect(clearAllHref("/categories/rice", { inStock: "1", cursor: "24" })).toBe(
      "/categories/rice",
    );
  });
});

/**
 * P2.6 slice 6 (#569), R24/R27/R30.
 *
 * R30 is the important one and it is a REGRESSION GUARD, not a feature test. A filter key has to be
 * registered in three independent places: this module's `REMOVABLE`, `search-href.ts`'s `CARRIED`,
 * and `app/(storefront)/categories/[slug]/page.tsx`'s hand-written `buildHref` chain. Omit it from
 * either of the latter two and the filter is silently dropped one click into pagination, leaving
 * the shopper on a wider result set than the chips claim is applied — exactly the bug #501 fixed
 * for `featured` and #568 for `category`, which is twice now.
 *
 * This pins the two LIST-shaped ones against each other so the next facet cannot repeat it. The
 * third is a hand-written chain a test cannot reach without importing a page module, so it stays
 * covered by R29's live pagination check instead — worth knowing when reading this file, because
 * two of three being pinned is not three.
 */
describe("#569 facet chips", () => {
  it("keeps REMOVABLE and search-href's CARRIED describing the same filter keys (R30)", () => {
    // `q` is in CARRIED because pagination must preserve the query, and deliberately absent from
    // REMOVABLE because it is not a filter (it is the page heading). That is the ONLY legitimate
    // difference between the two lists; everything else must match.
    // Compared as plain strings: the two lists are typed against different param shapes
    // (SearchHrefParams has no pagination keys, FilterChipParams does), and it is the KEY SET that
    // must agree, not the types.
    const carried = new Set<string>(CARRIED.filter((key) => key !== "q"));
    const removable = new Set<string>(REMOVABLE);

    expect([...removable].filter((key) => !carried.has(key))).toEqual([]);
    expect([...carried].filter((key) => !removable.has(key))).toEqual([]);
  });

  it("produces a removable chip for each new facet (R24)", () => {
    const chips = activeFilterChips("/search", {
      q: "rice",
      isVegetarian: "1",
      isGlutenFree: "1",
      isHmcCertified: "1",
      onOffer: "1",
      origin: "Morocco",
      brand: "shan",
      cursor: "24",
    });

    const keys = chips.map((chip) => chip.key);
    for (const key of [
      "isVegetarian",
      "isGlutenFree",
      "isHmcCertified",
      "onOffer",
      "origin",
      "brand",
    ]) {
      expect(keys).toContain(key);
    }

    for (const chip of chips) {
      // Every href keeps the query and drops pagination.
      expect(chip.href).toContain("q=rice");
      expect(chip.href).not.toContain("cursor=");
      // ...and removes only its own key.
      expect(chip.href).not.toContain(`${chip.key}=`);
    }
  });

  it("labels the new facets exactly (R27)", () => {
    const label = (params: Parameters<typeof activeFilterChips>[1], brandLabel?: string) =>
      activeFilterChips("/search", params, undefined, brandLabel)[0].label;

    expect(label({ isVegetarian: "1" })).toBe("Vegetarian");
    expect(label({ isGlutenFree: "1" })).toBe("Gluten free");
    expect(label({ isHmcCertified: "1" })).toBe("HMC certified");
    expect(label({ onOffer: "1" })).toBe("On offer");
    // Origin is its own label; brand resolves to the NAME the page passes in.
    expect(label({ origin: "Morocco" })).toBe("Morocco");
    expect(label({ brand: "shan" }, "Shan")).toBe("Shan");
  });
});
