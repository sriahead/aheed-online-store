import { describe, expect, it } from "vitest";
import { parsePrefixInput } from "@/lib/delivery-area-form";

/**
 * P9.2 (#612), R2 and R3.
 *
 * These assertions are not stylistic input tidying. `lib/delivery.ts` interpolates the STORED
 * prefix straight into a `RegExp` constructor, so before #612 made this column admin-writable the
 * only thing keeping a metacharacter out of it was that `prisma/seed.ts` was its sole writer. A
 * stored `M[` would throw a `SyntaxError` on the checkout path for every shopper of that vendor —
 * so the metacharacter cases below are the ones that actually matter.
 *
 * `parsePrefixInput` is an allow-list (`^[A-Z]{1,2}$`), not a metacharacter deny-list, and these
 * tests are written to match: they assert the accepted shape once and then confirm the allow-list
 * excludes every metacharacter, rather than implying the implementation enumerates them.
 */

/** Every regex metacharacter that would break `new RegExp("^" + prefix + "[0-9]")`. */
const METACHARACTERS = ["[", "(", "\\", ".", "*", "+", "?", "^", "$", "{", "|"];

describe("parsePrefixInput normalises a valid postcode area (R2)", () => {
  it.each([
    ["mk", "MK"],
    [" Mk ", "MK"],
    ["MK", "MK"],
    ["rg", "RG"],
    ["w", "W"],
    ["  e  ", "E"],
  ])("maps %j to %j", (input, expected) => {
    const result = parsePrefixInput(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(expected);
  });
});

describe("parsePrefixInput rejects anything that is not a postcode area (R3)", () => {
  it("rejects the empty string, and names the field so the form can point at it", () => {
    const result = parsePrefixInput("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("prefix");
  });

  it("rejects whitespace that trims to nothing", () => {
    expect(parsePrefixInput("   ").ok).toBe(false);
  });

  it.each(["MKX", "ABCD", "M1", "1M", "MK9", "M K"])("rejects %j", (input) => {
    expect(parsePrefixInput(input).ok).toBe(false);
  });

  it.each(METACHARACTERS)("rejects the bare metacharacter %j", (char) => {
    expect(parsePrefixInput(char).ok).toBe(false);
  });

  it.each(METACHARACTERS)("rejects %j appended to an otherwise valid area", (char) => {
    expect(parsePrefixInput(`MK${char}`).ok).toBe(false);
  });

  it("names the prefix field on every rejection, not just the empty one", () => {
    for (const input of ["MKX", "M1", ...METACHARACTERS]) {
      const result = parsePrefixInput(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.field).toBe("prefix");
    }
  });
});

describe("no value parsePrefixInput accepts can break lib/delivery.ts's RegExp (R3)", () => {
  /**
   * The property that actually protects checkout: whatever comes out of the parser must be safe to
   * interpolate. Asserted by construction rather than by trusting the regex — this is the exact
   * expression `isDeliverable` builds.
   */
  it.each(["mk", " Mk ", "rg", "w"])("accepted value from %j compiles as a matcher", (input) => {
    const result = parsePrefixInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(() => new RegExp(`^${result.value}[0-9]`)).not.toThrow();
    expect(new RegExp(`^${result.value}[0-9]`).test(`${result.value}9`)).toBe(true);
  });
});
