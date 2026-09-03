import { describe, expect, it } from "vitest";
import { MAX_SEARCH_TERMS, parseSearchQuery } from "@/lib/search-query";
import { parseListLine } from "@/lib/shopping-list";

/**
 * P2.6 slice 1 (#564), R1/R3/R4/R5.
 *
 * The tokeniser is pure, so everything about it is provable here — no database,
 * no Workers request. What it feeds (an AND of per-term predicates) is covered
 * in tests/search-repository.test.ts.
 */

describe("parseSearchQuery (R3)", () => {
  it("lowercases, splits on whitespace and collapses runs of it", () => {
    expect(parseSearchQuery("  Basmati   RICE  ")).toEqual(["basmati", "rice"]);
  });

  it("strips trailing punctuation", () => {
    expect(parseSearchQuery("rice,")).toEqual(["rice"]);
  });

  it("strips surrounding brackets", () => {
    expect(parseSearchQuery("(rice)")).toEqual(["rice"]);
  });

  it("drops tokens that are empty once stripped", () => {
    expect(parseSearchQuery("rice , basmati")).toEqual(["rice", "basmati"]);
  });

  it("drops a bare hyphen rather than making it a term (#572, R35)", () => {
    // REPLACES a #564-era case that asserted the opposite. The hyphen sits outside the punctuation
    // class both tokenisers share, so it used to survive as its own term and a query of
    // "rice - basmati" demanded a product whose text contained a literal hyphen. That was recorded
    // as deliberate at the time because narrowing it would have broken the R5 agreement below;
    // #572 settled that question the other way — the two tokenisers now diverge here on purpose.
    expect(parseSearchQuery("rice - basmati")).toEqual(["rice", "basmati"]);
  });

  it("drops any token carrying no letter or digit (#572, R35)", () => {
    expect(parseSearchQuery("rice && basmati")).toEqual(["rice", "basmati"]);
    expect(parseSearchQuery("--")).toEqual([]);
  });

  it("drops single-character tokens (#572, R34)", () => {
    // Measured at #564's Build: "e" matched 2,026 of roughly 2,000 products and "a" matched 2,024,
    // because a one-letter substring appears in nearly every description. That is not a search.
    expect(parseSearchQuery("e")).toEqual([]);
    expect(parseSearchQuery("a rice")).toEqual(["rice"]);
  });

  it("keeps two-character tokens, which carry real grocery meaning", () => {
    expect(parseSearchQuery("5l oil")).toEqual(["5l", "oil"]);
  });

  it("returns an empty array for an empty or whitespace-only query", () => {
    expect(parseSearchQuery("")).toEqual([]);
    expect(parseSearchQuery("   ")).toEqual([]);
    // Punctuation alone leaves nothing behind, so it is an empty query too.
    expect(parseSearchQuery(" ,. ")).toEqual([]);
  });
});

describe("MAX_SEARCH_TERMS (R1, R4)", () => {
  it("is 10", () => {
    expect(MAX_SEARCH_TERMS).toBe(10);
  });

  it("caps a longer query at MAX_SEARCH_TERMS rather than refusing it", () => {
    const fifteen = "one two three four five six seven eight nine ten eleven twelve a b c";
    expect(fifteen.split(" ")).toHaveLength(15);

    const terms = parseSearchQuery(fifteen);
    expect(terms).toHaveLength(MAX_SEARCH_TERMS);
    // The first ten, not an arbitrary ten: the shopper's leading words are the
    // ones that carry their intent.
    expect(terms[0]).toBe("one");
    expect(terms[MAX_SEARCH_TERMS - 1]).toBe("ten");
  });
});

/**
 * R5 — the two tokenisers in this codebase must not silently diverge, WITHIN THE DOMAIN WHERE THEY
 * ARE STILL REQUIRED TO AGREE.
 *
 * They are deliberately separate files (see lib/search-query.ts's docstring) and now differ on TWO
 * axes, not one:
 *
 *  1. QUANTITY — the list matcher strips the 10 from "10 apples"; search must not strip the 5kg
 *     from "5kg basmati rice".
 *  2. LOW-INFORMATION TOKENS (#572, R37) — search drops single characters and tokens with no letter
 *     or digit; `parseListLine` keeps them. A search term is a RECALL instrument, where a
 *     one-character token matches most of the catalogue and a bare hyphen matches nothing anyone
 *     wanted; a list line is something the shopper wrote deliberately and which passes through a
 *     review step before anything reaches a basket. Applying the filter to both would change
 *     "Shop your list" behaviour for no stated benefit.
 *
 * Every input below is therefore quantity-free AND free of low-information tokens, which is the
 * domain where agreement is still the rule rather than the exception.
 */
describe("agreement with lib/shopping-list.ts on quantity-free input (R5, R37)", () => {
  const QUANTITY_FREE = [
    "basmati rice",
    "5kg basmati rice",
    "sunflower oil 2L",
    "  Basmati   RICE  ",
    "chicken thighs, boneless",
    "(organic) apples!",
  ];

  it.each(QUANTITY_FREE)("agrees on %j", (input) => {
    const listed = parseListLine(input);
    expect(listed).not.toBeNull();
    expect(parseSearchQuery(input)).toEqual(listed?.terms);
  });

  it("covers at least five inputs", () => {
    expect(QUANTITY_FREE.length).toBeGreaterThanOrEqual(5);
  });

  it("still diverges where it is meant to: a leading bare count", () => {
    // The list matcher reads "10" as a quantity; search must keep it as a term, or a shopper
    // searching a product whose name starts with a number loses it.
    //
    // This case used to read "2 apples". #572 changed what that particular input proves: "2" is a
    // single character, so search now drops it as low-information and the two tokenisers happen to
    // AGREE on it. A two-digit count keeps the original divergence observable.
    expect(parseListLine("10 apples")?.terms).toEqual(["apples"]);
    expect(parseSearchQuery("10 apples")).toEqual(["10", "apples"]);
  });

  it("diverges on low-information tokens (#572, R37)", () => {
    expect(parseListLine("rice - basmati")?.terms).toEqual(["rice", "-", "basmati"]);
    expect(parseSearchQuery("rice - basmati")).toEqual(["rice", "basmati"]);
  });
});
