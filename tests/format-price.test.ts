import { describe, it, expect } from "vitest";
import { formatPrice } from "@/components/product/format-price";

// Proves R8: pure, no floating-point money math, correct for whole- and sub-pound amounts.
describe("formatPrice", () => {
  it("formats a whole-pound amount", () => {
    expect(formatPrice(450)).toBe("£4.50");
  });
  it("formats a sub-pound amount", () => {
    expect(formatPrice(50)).toBe("£0.50");
  });
  it("formats an exact pound amount with trailing zeros", () => {
    expect(formatPrice(100)).toBe("£1.00");
  });
});
