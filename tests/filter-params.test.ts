import { describe, expect, it } from "vitest";
import {
  FIXED_FILTER_KEYS,
  filterEntries,
  isAttributeParamKey,
} from "@/components/product/filter-params";
import { activeFilterChips, clearAllHref } from "@/components/product/filter-chips";
import { categoryFilterHref, searchPageHref } from "@/components/product/search-href";
import { nextCategoryPageHref, prevCategoryPageHref } from "@/components/product/category-href";

/**
 * #601 (folded into #912), R6 — every href builder carries every filter key.
 *
 * Before #601 this could only be checked for two of the three places a filter key lived: the third
 * was a hand-written chain inside the category page module, which a test cannot import. That chain
 * is gone (`components/product/category-href.ts` replaced it), so all four builders are asserted
 * here against ONE list — `FIXED_FILTER_KEYS` — plus a vendor-defined `attr_*` key, which no list
 * could ever have held.
 */

/** A distinct value per key, so a crossed wire (key A given key B's value) cannot pass. */
const EVERY_FILTER: Record<string, string> = Object.fromEntries([
  ...FIXED_FILTER_KEYS.map((key) => [key, `v-${key}`]),
  ["attr_colour", "black"],
]);

const EXPECTED_KEYS = [...FIXED_FILTER_KEYS, "attr_colour"];

function paramsOf(href: string): URLSearchParams {
  return new URLSearchParams(href.split("?")[1] ?? "");
}

function expectAllCarried(href: string, except: readonly string[] = []): void {
  const qs = paramsOf(href);
  for (const key of EXPECTED_KEYS) {
    if (except.includes(key)) continue;
    expect(qs.get(key), `${href} dropped ${key}`).toBe(EVERY_FILTER[key]);
  }
}

describe("filter-params (R4)", () => {
  it("recognises only well-formed attribute keys", () => {
    expect(isAttributeParamKey("attr_colour")).toBe(true);
    expect(isAttributeParamKey("attr_screen-size-2")).toBe(true);
    expect(isAttributeParamKey("attr_")).toBe(false);
    expect(isAttributeParamKey("attr_Colour!")).toBe(false);
    expect(isAttributeParamKey("colour")).toBe(false);
  });

  it("orders fixed keys first, then attribute keys sorted, and honours omit", () => {
    const entries = filterEntries(
      { attr_zeta: "1", attr_alpha: "2", brand: "shan", inStock: "1", q: "rice", cursor: "9" },
      ["inStock"],
    );
    expect(entries).toEqual([
      ["brand", "shan"],
      ["attr_alpha", "2"],
      ["attr_zeta", "1"],
    ]);
  });
});

describe("every builder carries every filter key (R6a)", () => {
  const params = { q: "rice", ...EVERY_FILTER, cursor: "c2", back: ",c1" };

  it("searchPageHref", () => {
    expectAllCarried(searchPageHref(params, "next"));
  });

  it("categoryFilterHref (category itself is replaced)", () => {
    const href = categoryFilterHref(params, "new-dept");
    expectAllCarried(href, ["category"]);
    expect(paramsOf(href).get("category")).toBe("new-dept");
  });

  it("nextCategoryPageHref", () => {
    expectAllCarried(nextCategoryPageHref("rice", params, "next"));
  });

  it("prevCategoryPageHref", () => {
    expectAllCarried(prevCategoryPageHref("rice", params));
  });
});

describe("attribute chips and clear-all (R6b, R6c)", () => {
  const params = { q: "rice", ...EVERY_FILTER };

  it("the attr_colour chip removes only attr_colour", () => {
    const chips = activeFilterChips("/search", params, "Dept", "Brand", {
      attr_colour: "Colour: Black",
    });
    const chip = chips.find((c) => c.key === "attr_colour");
    expect(chip?.label).toBe("Colour: Black");
    const qs = paramsOf(chip!.href);
    expect(qs.has("attr_colour")).toBe(false);
    expect(qs.get("q")).toBe("rice");
    expectAllCarried(chip!.href, ["attr_colour"]);
  });

  it("an attribute key with no resolved label renders no chip", () => {
    const chips = activeFilterChips("/search", { attr_colour: "nope" });
    expect(chips).toEqual([]);
  });

  it("clearAllHref removes every fixed and attribute filter and keeps q", () => {
    const qs = paramsOf(clearAllHref("/search", params));
    expect(qs.get("q")).toBe("rice");
    for (const key of EXPECTED_KEYS) expect(qs.has(key), `${key} survived clear-all`).toBe(false);
  });
});

describe("malformed attribute params are carried by no builder (R6d)", () => {
  const params = {
    q: "rice",
    attr_colour: ["black", "white"],
    "attr_Colour!": "black",
    cursor: "c2",
  };

  it.each([
    ["searchPageHref", () => searchPageHref(params, "next")],
    ["categoryFilterHref", () => categoryFilterHref(params, "dept")],
    ["nextCategoryPageHref", () => nextCategoryPageHref("rice", params, "next")],
    ["prevCategoryPageHref", () => prevCategoryPageHref("rice", params)],
    ["clearAllHref", () => clearAllHref("/search", params)],
  ])("%s", (_name, build) => {
    const href = build();
    expect(href).not.toContain("attr_colour");
    expect(href).not.toContain("attr_Colour");
  });
});
