import { describe, it, expect } from "vitest";
import { isDeliverable } from "@/lib/delivery";

// Proves R7: pure, no Prisma/network dependency, LE1-LE5 only, tolerant of case/spacing.
describe("isDeliverable", () => {
  it("matches a plain Leicester postcode", () => {
    expect(isDeliverable("LE1 1AA")).toBe(true);
  });
  it("is case-insensitive and tolerant of spacing", () => {
    expect(isDeliverable("le3 4xy")).toBe(true);
    expect(isDeliverable("LE34XY")).toBe(true);
  });
  it("rejects a non-Leicester postcode", () => {
    expect(isDeliverable("SW1A 1AA")).toBe(false);
  });
  it("rejects a Leicester district outside LE1-LE5", () => {
    expect(isDeliverable("LE10 1AA")).toBe(false);
  });
  it("rejects blank or malformed input", () => {
    expect(isDeliverable("")).toBe(false);
    expect(isDeliverable("   ")).toBe(false);
    expect(isDeliverable("not a postcode")).toBe(false);
  });
});
