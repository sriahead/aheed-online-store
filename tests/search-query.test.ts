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

  it("keeps an interior hyphen as its own term, as lib/shopping-list.ts does", () => {
    // Not an oversight and not free to change: the hyphen is outside the
    // punctuation class BOTH tokenisers share, so narrowing it here would break
    // the R5 agreement. Recorded because it has a real consequence — a query of
    // "rice - basmati" requires a product whose text contains a hyphen.
    expect(parseSearchQuery("rice - basmati")).toEqual(["rice", "-", "basmati"]);
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
 * R5 — the two tokenisers in this codebase must not silently diverge.
 *
 * They are deliberately separate files (see lib/search-query.ts's docstring):
 * they differ at the QUANTITY level, because the list matcher strips the 2 from
 * "2 apples" and search must not strip the 5kg from "5kg basmati rice". Every
 * input below is quantity-free, which is exactly the domain where they are
 * required to agree.
 */
describe("agreement with lib/shopping-list.ts on quantity-free input (R5)", () => {
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
    // The list matcher reads "2" as a quantity; search must keep it as a term,
    // or a shopper searching a product whose name starts with a number loses it.
    expect(parseListLine("2 apples")?.terms).toEqual(["apples"]);
    expect(parseSearchQuery("2 apples")).toEqual(["2", "apples"]);
  });
});
