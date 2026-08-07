import { describe, it, expect } from "vitest";
import { parsePriceInput } from "@/components/product/parse-price-input";

// Proves R6: pure counterpart to formatPrice, no floating-point money math leaks through.
describe("parsePriceInput", () => {
  it("parses a pounds string into integer pence", () => {
    expect(parsePriceInput("3.20")).toBe(320);
  });
  it("returns undefined for blank input", () => {
    expect(parsePriceInput("")).toBeUndefined();
    expect(parsePriceInput("   ")).toBeUndefined();
  });
  it("returns undefined for non-numeric input", () => {
    expect(parsePriceInput("abc")).toBeUndefined();
  });
  it("returns undefined for negative input", () => {
    expect(parsePriceInput("-5")).toBeUndefined();
  });
});
