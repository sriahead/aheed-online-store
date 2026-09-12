import { describe, it, expect } from "vitest";
import { isDeliverable } from "@/lib/delivery";

// Proves the delivery check: pure, no Prisma/network, prefixes supplied by the
// caller from the vendor's VendorDeliveryArea rows (ADR-004 slice 4). Tolerant of
// case/spacing.
describe("isDeliverable", () => {
  it("matches single- and double-digit districts of a prefix", () => {
    expect(isDeliverable("MK9 1AA", ["MK"])).toBe(true);
    expect(isDeliverable("MK19 6QR", ["MK"])).toBe(true);
    expect(isDeliverable("MK24 5AB", ["MK"])).toBe(true);
  });
  it("is case-insensitive and tolerant of spacing", () => {
    expect(isDeliverable("mk3 6xy", ["MK"])).toBe(true);
    expect(isDeliverable("MK36XY", ["MK"])).toBe(true);
    expect(isDeliverable("rg1 1aa", ["RG"])).toBe(true);
  });
  it("matches any prefix when a vendor delivers to several", () => {
    expect(isDeliverable("RG1 1AA", ["MK", "RG"])).toBe(true);
    expect(isDeliverable("MK9 1AA", ["MK", "RG"])).toBe(true);
    expect(isDeliverable("B1 1AA", ["MK", "RG"])).toBe(false);
  });
  it("rejects postcodes outside the vendor's prefixes", () => {
    expect(isDeliverable("SW1A 1AA", ["MK"])).toBe(false);
    expect(isDeliverable("LE1 1AA", ["MK"])).toBe(false);
    expect(isDeliverable("RG1 1AA", ["MK"])).toBe(false);
  });
  it("rejects blank/malformed input or an empty prefix list", () => {
    expect(isDeliverable("", ["MK"])).toBe(false);
    expect(isDeliverable("   ", ["MK"])).toBe(false);
    expect(isDeliverable("MK", ["MK"])).toBe(false); // prefix with no district digit
    expect(isDeliverable("not a postcode", ["MK"])).toBe(false);
    expect(isDeliverable("MK9 1AA", [])).toBe(false); // vendor has no delivery areas
  });
  it("supports exact district matching without over-matching (#613)", () => {
    // MK1 should match MK1 exactly, but NOT MK17
    expect(isDeliverable("MK1 1AA", ["MK1"])).toBe(true);
    expect(isDeliverable("MK17 1AA", ["MK1"])).toBe(false);
    expect(isDeliverable("MK10 1AA", ["MK1"])).toBe(false);

    // EC1A should match EC1A exactly, but NOT EC1
    expect(isDeliverable("EC1A 1BB", ["EC1A"])).toBe(true);
    expect(isDeliverable("EC1A 1BB", ["EC1"])).toBe(false);
    expect(isDeliverable("EC1 1BB", ["EC1A"])).toBe(false);
  });
});
