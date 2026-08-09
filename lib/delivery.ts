// Vendor delivery footprint is DB-driven (ADR-004 slice 4): a vendor's
// VendorDeliveryArea rows supply postcode-district prefixes (e.g. "MK", "RG").
// This function stays PURE — no Prisma/network — so callers fetch the prefixes
// (via lib/repositories/vendor) and pass them in; keeps it trivially testable.

/**
 * True when `postcode`'s outward area starts with one of the vendor's `prefixes`
 * followed by a digit — e.g. `isDeliverable("MK9 1AA", ["MK"])`. Tolerant of
 * case/spacing. Empty postcode or empty prefix list ⇒ not deliverable.
 */
export function isDeliverable(postcode: string, prefixes: string[]): boolean {
  const normalized = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized || prefixes.length === 0) return false;
  return prefixes.some((prefix) => {
    const p = prefix.trim().toUpperCase();
    // Outward area must be the prefix immediately followed by a digit, so a bare
    // "MK" (no district number) is not deliverable, matching the old MK regex.
    return p.length > 0 && new RegExp(`^${p}[0-9]`).test(normalized);
  });
}
