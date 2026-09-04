import { describe, expect, it } from "vitest";
import { expandSearchTerms, flattenVariants, toUnexpandedGroups } from "@/lib/search-expansion";

/**
 * P2.6 slice 3 (#566), R1-R7.
 *
 * Every case here builds its alias map in-process. That is the point of the module being pure: the
 * rule that decides what a shopper's query matches is provable with no database and no Workers
 * request, which is also why R7 asserts the module imports neither.
 */

const HALDI = new Map([["haldi", "turmeric"]]);

describe("expandSearchTerms shape (R1)", () => {
  it("returns one group per input term, in input order", () => {
    const groups = expandSearchTerms(["rice", "haldi"], HALDI);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.term)).toEqual(["rice", "haldi"]);
    for (const group of groups) {
      expect(Array.isArray(group.variants)).toBe(true);
    }
  });
});

describe("expansion never replaces the shopper's word (R2)", () => {
  it("keeps the original term at variants[0], including for an aliased term", () => {
    for (const group of expandSearchTerms(["rice", "haldi"], HALDI)) {
      expect(group.variants[0]).toBe(group.term);
    }
  });

  it("adds the canonical term rather than substituting it", () => {
    const [group] = expandSearchTerms(["haldi"], HALDI);
    expect(group.variants).toEqual(["haldi", "turmeric"]);
  });
});

describe("an empty dictionary is a no-op (R3)", () => {
  it("returns a single-variant group per term", () => {
    expect(expandSearchTerms(["rice"], new Map())).toEqual([{ term: "rice", variants: ["rice"] }]);
  });

  it("agrees with toUnexpandedGroups", () => {
    expect(expandSearchTerms(["rice", "atta"], new Map())).toEqual(
      toUnexpandedGroups(["rice", "atta"]),
    );
  });
});

describe("alias matching is case-insensitive (R4)", () => {
  it("expands a lowercase term against an alias stored with capitals", () => {
    // A row could have been written with any casing before the repository folded on write, and
    // that row cannot be fixed retroactively — so the read side folds too.
    const groups = expandSearchTerms(["haldi"], new Map([["Haldi", "Turmeric"]]));
    expect(groups[0].variants).toEqual(["haldi", "turmeric"]);
  });
});

describe("expansion is a single hop (R5)", () => {
  it("does not follow a canonical term that is itself an alias", () => {
    const chained = new Map([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(expandSearchTerms(["a"], chained)).toEqual([{ term: "a", variants: ["a", "b"] }]);
  });

  it("still expands the chained term when the shopper types it directly", () => {
    const chained = new Map([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(expandSearchTerms(["b"], chained)).toEqual([{ term: "b", variants: ["b", "c"] }]);
  });
});

describe("group size is bounded (R6)", () => {
  it("never produces more than two variants, whatever the dictionary holds", () => {
    // Many aliases MAY share one canonical term; what the schema forbids is one alias resolving to
    // several canonicals, and that is what bounds the predicate.
    const many = new Map([
      ["haldi", "turmeric"],
      ["keema", "mince"],
      ["qeema", "mince"],
      ["bhindi", "okra"],
      ["atta", "flour"],
    ]);
    const groups = expandSearchTerms(["haldi", "keema", "qeema", "bhindi", "atta", "rice"], many);
    for (const group of groups) {
      expect(group.variants.length).toBeLessThanOrEqual(2);
    }
  });

  it("does not duplicate a variant for a self-mapping row", () => {
    // The staff form rejects alias === canonical, but an older row could hold one; a pointless OR
    // must not reach the query.
    expect(expandSearchTerms(["rice"], new Map([["rice", "rice"]]))).toEqual([
      { term: "rice", variants: ["rice"] },
    ]);
  });
});

describe("flattenVariants", () => {
  it("deduplicates across groups", () => {
    const groups = expandSearchTerms(
      ["keema", "qeema"],
      new Map([
        ["keema", "mince"],
        ["qeema", "mince"],
      ]),
    );
    expect(flattenVariants(groups)).toEqual(["keema", "mince", "qeema"]);
  });
});
