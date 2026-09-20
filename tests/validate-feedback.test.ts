import { describe, expect, it } from "vitest";
import {
  MAX_COMMENT_LENGTH,
  parseComment,
  toDisplayAuthorName,
} from "@/features/feedback/validate-feedback";
import { parseRating } from "@/features/reviews/validate-rating";

/**
 * P9.2 (#818) R19, R20, R22 — the pure half of feedback validation.
 *
 * `parseRating` is covered here as well as in its own suite, deliberately: this slice REUSES
 * it rather than reimplementing it, and the thing worth asserting is that feedback's rating
 * rule is the same rule. If someone later forks a private copy, this file is where the
 * duplication should show up.
 */

describe("parseRating, reused by feedback (R19)", () => {
  it.each([
    ["1", 1],
    ["5", 5],
    ["3", 3],
  ])("accepts %s", (input, expected) => {
    expect(parseRating(input)).toBe(expected);
  });

  it.each(["0", "6", "4.5", "", "   ", "five", "-2", "NaN"])("refuses %j", (input) => {
    expect(parseRating(input)).toBeNull();
  });
});

describe("parseComment (R20)", () => {
  it("accepts an ordinary comment and returns it trimmed", () => {
    const result = parseComment("  Lovely lamb, delivered on time.  ");
    expect(result).toEqual({ ok: true, value: "Lovely lamb, delivered on time." });
  });

  it("refuses an empty comment", () => {
    expect(parseComment("").ok).toBe(false);
  });

  it("refuses a whitespace-only comment — the trim is what decides, not the raw length", () => {
    expect(parseComment("   \n\t  ").ok).toBe(false);
  });

  it(`accepts exactly ${MAX_COMMENT_LENGTH} characters`, () => {
    expect(parseComment("a".repeat(MAX_COMMENT_LENGTH)).ok).toBe(true);
  });

  it(`refuses ${MAX_COMMENT_LENGTH + 1} characters`, () => {
    expect(parseComment("a".repeat(MAX_COMMENT_LENGTH + 1)).ok).toBe(false);
  });

  it("measures the cap AFTER trimming, so padding does not push a valid comment over", () => {
    const padded = `  ${"a".repeat(MAX_COMMENT_LENGTH)}  `;
    expect(parseComment(padded).ok).toBe(true);
  });

  it("does not strip or escape markup — escaping is the renderer's job, not the parser's", () => {
    const result = parseComment("<b>great</b>");
    expect(result).toEqual({ ok: true, value: "<b>great</b>" });
  });
});

describe("toDisplayAuthorName (R22)", () => {
  it("renders first name plus surname initial", () => {
    expect(toDisplayAuthorName("Sarah Mitchell")).toBe("Sarah M.");
  });

  it("uses the LAST part as the surname, not the second", () => {
    expect(toDisplayAuthorName("Mary Jane Watson")).toBe("Mary W.");
  });

  it("uppercases the initial even when the account name is lowercase", () => {
    expect(toDisplayAuthorName("sarah mitchell")).toBe("sarah M.");
  });

  it("passes a single-word name through rather than inventing an initial", () => {
    expect(toDisplayAuthorName("Prince")).toBe("Prince");
  });

  it("collapses irregular whitespace rather than producing an empty surname", () => {
    expect(toDisplayAuthorName("  Sarah   Mitchell  ")).toBe("Sarah M.");
  });

  it("falls back to a neutral label for an empty name, never an empty byline", () => {
    expect(toDisplayAuthorName("")).toBe("A customer");
    expect(toDisplayAuthorName("   ")).toBe("A customer");
  });
});
