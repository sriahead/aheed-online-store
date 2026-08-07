import { describe, it, expect } from "vitest";
import { isDeliverable } from "@/lib/delivery";

// Proves the delivery check: pure, no Prisma/network dependency, any Milton Keynes
// (MK) postcode district, tolerant of case/spacing.
describe("isDeliverable", () => {
  it("matches single- and double-digit MK districts", () => {
    expect(isDeliverable("MK9 1AA")).toBe(true);
    expect(isDeliverable("MK19 6QR")).toBe(true);
    expect(isDeliverable("MK24 5AB")).toBe(true); // previously wrongly rejected
  });
  it("is case-insensitive and tolerant of spacing", () => {
    expect(isDeliverable("mk3 6xy")).toBe(true);
    expect(isDeliverable("MK36XY")).toBe(true);
  });
  it("rejects non-MK postcodes", () => {
    expect(isDeliverable("SW1A 1AA")).toBe(false);
    expect(isDeliverable("LE1 1AA")).toBe(false);
    expect(isDeliverable("B1 1AA")).toBe(false);
  });
  it("rejects blank or malformed input", () => {
    expect(isDeliverable("")).toBe(false);
    expect(isDeliverable("   ")).toBe(false);
    expect(isDeliverable("MK")).toBe(false);
    expect(isDeliverable("not a postcode")).toBe(false);
  });
});
