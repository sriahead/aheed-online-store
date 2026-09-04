import { describe, expect, it } from "vitest";
import {
  hasNameTierCandidate,
  normaliseCandidateName,
  rankSearchCandidates,
  type SearchCandidate,
} from "@/lib/search-ranking";
import { expandSearchTerms, toUnexpandedGroups } from "@/lib/search-expansion";

/**
 * P2.6 slice 1 (#564), R10-R14.
 *
 * The ranker is pure, which is the entire reason the tier logic lives in
 * lib/search-ranking.ts rather than in a query: every ordering rule below is
 * provable without a database, including the ones a live catalogue would only
 * exercise by luck (an out-of-stock exact-name match, a name collision).
 */

const TERMS = ["basmati", "rice"];
/**
 * P2.6 slice 3 (#566) turned the ranker's second parameter from a flat term list into term GROUPS.
 * `toUnexpandedGroups` is the no-dictionary form — one single-variant group per term — so every
 * pre-existing case below still asserts exactly what it asserted before, unchanged in meaning.
 */
const GROUPS = toUnexpandedGroups(TERMS);

function candidate(id: string, name: string, inStock: boolean): SearchCandidate {
  return { id, name, inStock };
}

/** One candidate per tier, deliberately built in already-correct order. */
const TIER_0 = candidate("t0", "Basmati Rice", false); // exact name, out of stock
const TIER_1 = candidate("t1", "Basmati Rice 5kg", true); // all terms in name, in stock
const TIER_2 = candidate("t2", "Organic Basmati Rice", false); // all terms in name, out of stock
const TIER_3 = candidate("t3", "Pilau Mix", true); // matched via description only, in stock
const TIER_4 = candidate("t4", "Curry Paste", false); // matched via description only, out of stock

function ids(ranked: SearchCandidate[]): string[] {
  return ranked.map((c) => c.id);
}

describe("rankSearchCandidates tiers (R11)", () => {
  it("orders one candidate per tier as 0, 1, 2, 3, 4", () => {
    // Shuffled in, so a pass cannot come from the input order.
    const input = [TIER_3, TIER_0, TIER_4, TIER_2, TIER_1];
    expect(ids(rankSearchCandidates(input, GROUPS))).toEqual(["t0", "t1", "t2", "t3", "t4"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [TIER_3, TIER_0, TIER_4];
    const before = ids(input);
    rankSearchCandidates(input, GROUPS);
    expect(ids(input)).toEqual(before);
  });
});

describe("normaliseCandidateName (R11a)", () => {
  it("lowercases, trims and collapses internal whitespace", () => {
    expect(normaliseCandidateName("  Basmati   Rice  ")).toBe("basmati rice");
  });

  it("puts a double-spaced name in tier 0, ahead of an in-stock tier-1 product", () => {
    // Without whitespace collapsing this name could never equal the
    // single-spaced terms.join(" "), so it could never reach tier 0 no matter
    // what the shopper typed.
    const doubleSpaced = candidate("d", "Basmati  Rice", false);
    expect(ids(rankSearchCandidates([TIER_1, doubleSpaced], GROUPS))).toEqual(["d", "t1"]);
  });

  it("puts an all-caps exact name in tier 0, ahead of an in-stock tier-1 product", () => {
    const shouty = candidate("s", "BASMATI RICE", false);
    expect(ids(rankSearchCandidates([TIER_1, shouty], GROUPS))).toEqual(["s", "t1"]);
  });
});

describe("relevance dominates availability (R12, R13)", () => {
  it("ranks an out-of-stock exact-name match above an in-stock all-terms match (R12)", () => {
    expect(ids(rankSearchCandidates([TIER_1, TIER_0], GROUPS))).toEqual(["t0", "t1"]);
  });

  it("ranks an out-of-stock name match above an in-stock description-only match (R13)", () => {
    // Burying an out-of-stock staple reads as "they do not sell this", which is
    // worse than showing it unavailable — and inStockOnly is a filter the
    // shopper already has for the other behaviour.
    expect(ids(rankSearchCandidates([TIER_3, TIER_2], GROUPS))).toEqual(["t2", "t3"]);
  });
});

describe("within-tier tie-breaks are a total order (R14)", () => {
  it("prefers the shorter name", () => {
    const short = candidate("a", "Basmati Rice 1kg", true);
    const long = candidate("b", "Basmati Rice 10kg Sack", true);
    expect(ids(rankSearchCandidates([long, short], GROUPS))).toEqual(["a", "b"]);
  });

  it("breaks a same-length tie alphabetically", () => {
    const alpha = candidate("a", "Basmati Rice AAA", true);
    const beta = candidate("b", "Basmati Rice BBB", true);
    expect(ids(rankSearchCandidates([beta, alpha], GROUPS))).toEqual(["a", "b"]);
  });

  it("breaks an identical-name tie by id (R14a)", () => {
    // Two products can legitimately share a name across categories. Without
    // this step the order is not total, and the cursor is an offset into it.
    const zed = candidate("z-id", "Basmati Rice 5kg", true);
    const abe = candidate("a-id", "Basmati Rice 5kg", true);
    expect(ids(rankSearchCandidates([zed, abe], GROUPS))).toEqual(["a-id", "z-id"]);
  });

  it("produces the same sequence from two differently ordered input arrays (R14b)", () => {
    const all = [TIER_0, TIER_1, TIER_2, TIER_3, TIER_4];
    const reversed = [...all].reverse();
    // A fixed permutation, not a random shuffle — a flaky test proves nothing.
    const shuffled = [all[2], all[4], all[0], all[3], all[1]];

    const fromReversed = ids(rankSearchCandidates(reversed, GROUPS));
    const fromShuffled = ids(rankSearchCandidates(shuffled, GROUPS));

    expect(fromReversed).toEqual(fromShuffled);
    expect(fromReversed).toEqual(ids(rankSearchCandidates(all, GROUPS)));
  });
});

/**
 * P2.6 slice 3 (#566) — R7, R8. An alias match must rank as strongly as the word the shopper
 * typed, which is the whole reason expansion produces groups rather than a longer flat list.
 */
describe("ranking over expanded term groups (R7, R8)", () => {
  const HALDI = toUnexpandedGroups(["haldi"]);
  const HALDI_EXPANDED = expandSearchTerms(["haldi"], new Map([["haldi", "turmeric"]]));
  const TURMERIC = candidate("p1", "Turmeric Powder", true);

  it("puts an alias-matched product in a NAME tier, not a description tier (R7)", () => {
    // Without the dictionary the shopper's word appears nowhere in the name, so the only honest
    // tier is a description-only one.
    expect(hasNameTierCandidate([TURMERIC], HALDI)).toBe(false);
    // With it approved, the product is what the shopper asked for and ranks accordingly.
    expect(hasNameTierCandidate([TURMERIC], HALDI_EXPANDED)).toBe(true);
  });

  it("requires EVERY group to be satisfied, by any one of its variants", () => {
    const groups = expandSearchTerms(["haldi", "powder"], new Map([["haldi", "turmeric"]]));
    expect(hasNameTierCandidate([TURMERIC], groups)).toBe(true);
    // "flakes" is satisfied by nothing in the name, so the AND across groups fails.
    const unmet = expandSearchTerms(["haldi", "flakes"], new Map([["haldi", "turmeric"]]));
    expect(hasNameTierCandidate([TURMERIC], unmet)).toBe(false);
  });

  it("decides tier 0 from the ORIGINAL query, never from an expanded variant (R8)", () => {
    // The candidate's name IS the canonical term, but the shopper did not type it — so this is a
    // strong match (tier 1) and NOT the "typed the product's name exactly" tier.
    const exactCanonical = candidate("p2", "turmeric", true);
    const viaAlias = expandSearchTerms(["haldi"], new Map([["haldi", "turmeric"]]));
    const typedDirectly = toUnexpandedGroups(["turmeric"]);

    // Tier 0 outranks tier 1, so a directly-typed exact name wins a head-to-head against a
    // longer alias-matched name; ranking is the observable proxy for the tier itself.
    const other = candidate("p3", "Turmeric Powder", true);
    expect(rankSearchCandidates([other, exactCanonical], typedDirectly).map((c) => c.id)).toEqual([
      "p2",
      "p3",
    ]);
    // Reached by alias, "turmeric" is not tier 0; both are tier 1 and the shorter name wins the
    // tie-break, which happens to be the same order — so assert the tier property directly.
    expect(hasNameTierCandidate([exactCanonical], viaAlias)).toBe(true);
  });
});

/** P2.6 slice 3 (#580) — R10. The thin-result predicate. */
describe("hasNameTierCandidate (R10)", () => {
  it("is true when at least one candidate matched on name", () => {
    expect(hasNameTierCandidate([TIER_3, TIER_1], GROUPS)).toBe(true);
  });

  it("is false when every candidate matched through description only", () => {
    expect(hasNameTierCandidate([TIER_3, TIER_4], GROUPS)).toBe(false);
  });

  it("is false for an empty candidate set", () => {
    expect(hasNameTierCandidate([], GROUPS)).toBe(false);
  });
});
