import { describe, expect, it } from "vitest";
import {
  correctTerms,
  levenshteinDistance,
  maxEditDistanceFor,
} from "@/lib/search-typo-correction";

describe("levenshteinDistance (R2)", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("rice", "rice")).toBe(0);
  });

  it("returns 1 for one substitution", () => {
    expect(levenshteinDistance("rice", "ricd")).toBe(1);
  });

  it("returns 1 for one insertion", () => {
    expect(levenshteinDistance("rice", "ricee")).toBe(1);
  });

  it("returns 1 for one deletion", () => {
    expect(levenshteinDistance("rice", "ric")).toBe(1);
  });

  it("handles the empty-string cases", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
    expect(levenshteinDistance("", "")).toBe(0);
  });
});

describe("maxEditDistanceFor (R3)", () => {
  it("is 0 at and below length 3", () => {
    expect(maxEditDistanceFor(1)).toBe(0);
    expect(maxEditDistanceFor(3)).toBe(0);
  });

  it("is 1 between length 4 and 6", () => {
    expect(maxEditDistanceFor(4)).toBe(1);
    expect(maxEditDistanceFor(6)).toBe(1);
  });

  it("is 2 at and above length 7", () => {
    expect(maxEditDistanceFor(7)).toBe(2);
    expect(maxEditDistanceFor(20)).toBe(2);
  });
});

describe("correctTerms (R4)", () => {
  it("leaves a term already in the vocabulary untouched", () => {
    const result = correctTerms(["rice"], new Set(["rice", "ricd"]));
    expect(result).toEqual({ terms: ["rice"], corrected: false });
  });

  it("replaces a term absent from the vocabulary with its nearest token within budget", () => {
    const result = correctTerms(["ricd"], new Set(["rice", "basmati"]));
    expect(result).toEqual({ terms: ["rice"], corrected: true });
  });

  it("breaks a tie between equidistant tokens alphabetically", () => {
    // "rico" is distance 1 from both "rice" (o->e) and "rick" (o->k) — same length, budget 1.
    const result = correctTerms(["rico"], new Set(["rice", "rick"]));
    expect(result).toEqual({ terms: ["rice"], corrected: true });
  });

  it("leaves a term unchanged, and does not report it as corrected, when nothing is within budget", () => {
    const result = correctTerms(["zzzzz"], new Set(["basmati"]));
    expect(result).toEqual({ terms: ["zzzzz"], corrected: false });
  });

  it("corrects only the terms that need it, in one call", () => {
    const result = correctTerms(["basmati", "ricd"], new Set(["basmati", "rice"]));
    expect(result).toEqual({ terms: ["basmati", "rice"], corrected: true });
  });
});

describe("correctTerms respects its own length-based budget (R5)", () => {
  it("never selects a replacement whose length differs from the term by more than the budget", () => {
    // Levenshtein distance can never be smaller than the length difference, so this is a
    // guarantee about the OUTPUT, not merely about the length pre-filter's internals: a
    // brute-force scan (every token, no length shortcut) cannot disagree with the real result.
    function bruteNearest(term: string, tokens: readonly string[]): string | null {
      const budget = maxEditDistanceFor(term.length);
      let best: string | null = null;
      let bestDistance = Infinity;
      for (const token of tokens) {
        const distance = levenshteinDistance(term, token);
        if (distance > budget) continue;
        if (
          distance < bestDistance ||
          (distance === bestDistance && best !== null && token < best)
        ) {
          best = token;
          bestDistance = distance;
        }
      }
      return best;
    }

    const vocabulary = ["rice", "race", "ricer", "riced", "basmatirice", "r", "ri"];
    const fixtureTerms = ["ricd", "rce", "bosmati", "riceee", "xx"];

    for (const term of fixtureTerms) {
      const { terms } = correctTerms([term], new Set(vocabulary));
      const expected = bruteNearest(term, vocabulary) ?? term;
      expect(terms[0]).toBe(expected);
    }
  });
});
