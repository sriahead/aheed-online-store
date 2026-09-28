import { describe, expect, it } from "vitest";
import {
  FIXED_FILTER_KEYS,
  filterEntries,
  isAttributeListParamKey,
  isAttributeParamKey,
  parseAttributeRangeParamKey,
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
      "attr_colour=black": "Colour: Black",
    });
    const chip = chips.find((c) => c.key === "attr_colour=black");
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

/*
 * #912's R6d asserted that a REPEATED `attr_colour` was carried by no builder. #918 deliberately
 * reverses that for LIST keys only — ticked checkboxes submit the key once per value, so the array
 * IS the filter (specs/architecture.md). A malformed key, and a repeated FIXED or RANGE key, are
 * still carried by nothing (#689).
 */
describe("malformed and repeated non-list params are carried by no builder (R6d, #918 R20)", () => {
  const params = {
    q: "rice",
    "attr_Colour!": "black",
    // A repeated parameter is an ARRAY at runtime whatever the page types declare (#689).
    minPrice: ["1", "2"] as unknown as string,
    attr_power_min: ["10", "20"],
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
    expect(href).not.toContain("attr_Colour");
    expect(href).not.toContain("minPrice");
    expect(href).not.toContain("attr_power_min");
  });
});

describe("list and range keys (#918 R20)", () => {
  it("recognises range keys and tells the two kinds apart", () => {
    expect(isAttributeParamKey("attr_power_min")).toBe(true);
    expect(isAttributeParamKey("attr_power_max")).toBe(true);
    expect(isAttributeParamKey("attr_power_mid")).toBe(false);
    expect(isAttributeListParamKey("attr_power")).toBe(true);
    expect(isAttributeListParamKey("attr_power_min")).toBe(false);
    expect(parseAttributeRangeParamKey("attr_screen-size_max")).toEqual({
      slug: "screen-size",
      bound: "max",
    });
    expect(parseAttributeRangeParamKey("attr_colour")).toBeNull();
  });

  it("yields one pair per distinct non-empty value of a repeated list key, in order", () => {
    expect(filterEntries({ attr_colour: ["black", "", "black", "white"] })).toEqual([
      ["attr_colour", "black"],
      ["attr_colour", "white"],
    ]);
  });

  it("still skips an array for a fixed key or a range key", () => {
    expect(filterEntries({ minPrice: ["1", "2"], attr_power_min: ["10", "20"] })).toEqual([]);
  });
});

describe("every builder keeps every value of a repeated list key (#918 R21)", () => {
  const params = {
    q: "cable",
    attr_colour: ["black", "white"],
    attr_power_min: "15",
    cursor: "c2",
  };

  it.each([
    ["searchPageHref", () => searchPageHref(params, "next")],
    ["categoryFilterHref", () => categoryFilterHref(params, "dept")],
    ["nextCategoryPageHref", () => nextCategoryPageHref("cables", params, "next")],
    ["prevCategoryPageHref", () => prevCategoryPageHref("cables", params)],
    [
      "a chip href (removing an unrelated filter)",
      () =>
        activeFilterChips("/search", { ...params, inStock: "1" }).find((c) => c.key === "inStock")!
          .href,
    ],
  ])("%s", (_name, build) => {
    const qs = paramsOf(build());
    expect(qs.getAll("attr_colour")).toEqual(["black", "white"]);
    expect(qs.get("attr_power_min")).toBe("15");
  });
});

describe("one chip per value; removing one keeps the others (#918 R24)", () => {
  const params = { attr_colour: ["black", "white"] };
  const labels = { "attr_colour=black": "Colour: Black", "attr_colour=white": "Colour: White" };

  it("renders a chip per resolved value, keyed by pair", () => {
    const chips = activeFilterChips("/search", params, undefined, undefined, labels);
    expect(chips.map((c) => [c.key, c.label])).toEqual([
      ["attr_colour=black", "Colour: Black"],
      ["attr_colour=white", "Colour: White"],
    ]);
  });

  it("the Black chip keeps White and drops only Black", () => {
    const chips = activeFilterChips("/search", params, undefined, undefined, labels);
    const black = chips.find((c) => c.key === "attr_colour=black")!;
    expect(paramsOf(black.href).getAll("attr_colour")).toEqual(["white"]);
  });

  it("an unresolved value renders no chip", () => {
    const chips = activeFilterChips(
      "/search",
      { attr_colour: ["black", "nope"] },
      undefined,
      undefined,
      {
        "attr_colour=black": "Colour: Black",
      },
    );
    expect(chips.map((c) => c.key)).toEqual(["attr_colour=black"]);
  });

  it("clearAllHref removes every value", () => {
    expect(paramsOf(clearAllHref("/search", params)).has("attr_colour")).toBe(false);
  });
});
