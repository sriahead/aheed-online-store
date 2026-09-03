import { describe, expect, it } from "vitest";
import {
  normaliseCandidateName,
  rankSearchCandidates,
  type SearchCandidate,
} from "@/lib/search-ranking";

/**
 * P2.6 slice 1 (#564), R10-R14.
 *
 * The ranker is pure, which is the entire reason the tier logic lives in
 * lib/search-ranking.ts rather than in a query: every ordering rule below is
 * provable without a database, including the ones a live catalogue would only
 * exercise by luck (an out-of-stock exact-name match, a name collision).
 */

const TERMS = ["basmati", "rice"];

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
    expect(ids(rankSearchCandidates(input, TERMS))).toEqual(["t0", "t1", "t2", "t3", "t4"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [TIER_3, TIER_0, TIER_4];
    const before = ids(input);
    rankSearchCandidates(input, TERMS);
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
    expect(ids(rankSearchCandidates([TIER_1, doubleSpaced], TERMS))).toEqual(["d", "t1"]);
  });

  it("puts an all-caps exact name in tier 0, ahead of an in-stock tier-1 product", () => {
    const shouty = candidate("s", "BASMATI RICE", false);
    expect(ids(rankSearchCandidates([TIER_1, shouty], TERMS))).toEqual(["s", "t1"]);
  });
});

describe("relevance dominates availability (R12, R13)", () => {
  it("ranks an out-of-stock exact-name match above an in-stock all-terms match (R12)", () => {
    expect(ids(rankSearchCandidates([TIER_1, TIER_0], TERMS))).toEqual(["t0", "t1"]);
  });

  it("ranks an out-of-stock name match above an in-stock description-only match (R13)", () => {
    // Burying an out-of-stock staple reads as "they do not sell this", which is
    // worse than showing it unavailable — and inStockOnly is a filter the
    // shopper already has for the other behaviour.
    expect(ids(rankSearchCandidates([TIER_3, TIER_2], TERMS))).toEqual(["t2", "t3"]);
  });
});

describe("within-tier tie-breaks are a total order (R14)", () => {
  it("prefers the shorter name", () => {
    const short = candidate("a", "Basmati Rice 1kg", true);
    const long = candidate("b", "Basmati Rice 10kg Sack", true);
    expect(ids(rankSearchCandidates([long, short], TERMS))).toEqual(["a", "b"]);
  });

  it("breaks a same-length tie alphabetically", () => {
    const alpha = candidate("a", "Basmati Rice AAA", true);
    const beta = candidate("b", "Basmati Rice BBB", true);
    expect(ids(rankSearchCandidates([beta, alpha], TERMS))).toEqual(["a", "b"]);
  });

  it("breaks an identical-name tie by id (R14a)", () => {
    // Two products can legitimately share a name across categories. Without
    // this step the order is not total, and the cursor is an offset into it.
    const zed = candidate("z-id", "Basmati Rice 5kg", true);
    const abe = candidate("a-id", "Basmati Rice 5kg", true);
    expect(ids(rankSearchCandidates([zed, abe], TERMS))).toEqual(["a-id", "z-id"]);
  });

  it("produces the same sequence from two differently ordered input arrays (R14b)", () => {
    const all = [TIER_0, TIER_1, TIER_2, TIER_3, TIER_4];
    const reversed = [...all].reverse();
    // A fixed permutation, not a random shuffle — a flaky test proves nothing.
    const shuffled = [all[2], all[4], all[0], all[3], all[1]];

    const fromReversed = ids(rankSearchCandidates(reversed, TERMS));
    const fromShuffled = ids(rankSearchCandidates(shuffled, TERMS));

    expect(fromReversed).toEqual(fromShuffled);
    expect(fromReversed).toEqual(ids(rankSearchCandidates(all, TERMS)));
  });
});
