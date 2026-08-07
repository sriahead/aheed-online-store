import { describe, it, expect } from "vitest";
import { parseRating } from "@/features/reviews/validate-rating";

// Proves R3: pure, no Prisma/network dependency, rejects out-of-range/non-numeric/blank input.
describe("parseRating", () => {
  it("parses a valid rating", () => {
    expect(parseRating("4")).toBe(4);
  });
  it("returns null for out-of-range ratings", () => {
    expect(parseRating("0")).toBeNull();
    expect(parseRating("6")).toBeNull();
  });
  it("returns null for non-numeric input", () => {
    expect(parseRating("abc")).toBeNull();
  });
  it("returns null for blank input", () => {
    expect(parseRating("")).toBeNull();
  });
});
