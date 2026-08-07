import { describe, it, expect } from "vitest";
import { isDeliverable } from "@/lib/delivery";

// Proves R7: pure, no Prisma/network dependency, Milton Keynes MK1-MK19 only,
// tolerant of case/spacing.
describe("isDeliverable", () => {
  it("matches a plain Milton Keynes postcode", () => {
    expect(isDeliverable("MK9 1AA")).toBe(true);
  });
  it("matches a two-digit Milton Keynes district", () => {
    expect(isDeliverable("MK14 5AB")).toBe(true);
    expect(isDeliverable("MK19 6QR")).toBe(true);
  });
  it("is case-insensitive and tolerant of spacing", () => {
    expect(isDeliverable("mk3 6xy")).toBe(true);
    expect(isDeliverable("MK36XY")).toBe(true);
  });
  it("rejects a non-Milton-Keynes postcode", () => {
    expect(isDeliverable("SW1A 1AA")).toBe(false);
    expect(isDeliverable("LE1 1AA")).toBe(false);
  });
  it("rejects a Milton Keynes district outside MK1-MK19 (e.g. Bedford MK40+)", () => {
    expect(isDeliverable("MK40 1AA")).toBe(false);
    expect(isDeliverable("MK20 1AA")).toBe(false);
  });
  it("rejects blank or malformed input", () => {
    expect(isDeliverable("")).toBe(false);
    expect(isDeliverable("   ")).toBe(false);
    expect(isDeliverable("not a postcode")).toBe(false);
  });
});
