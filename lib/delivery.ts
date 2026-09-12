// Vendor delivery footprint is DB-driven (ADR-004 slice 4): a vendor's
// VendorDeliveryArea rows supply postcode-district prefixes (e.g. "MK", "RG").
// This function stays PURE — no Prisma/network — so callers fetch the prefixes
// (via lib/repositories/vendor) and pass them in; keeps it trivially testable.

export function isDeliverable(postcode: string, prefixes: string[]): boolean {
  const normalized = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized || prefixes.length === 0) return false;

  let outward = normalized;

  // A full UK postcode has an inward code of exactly 3 characters starting with a digit.
  if (normalized.length >= 5 && /^[0-9]/.test(normalized.slice(-3))) {
    outward = normalized.slice(0, -3);
  }

  const match = outward.match(/^([A-Z]{1,2})/);
  if (!match) return false;
  const area = match[1];

  return prefixes.some((prefix) => {
    const p = prefix.trim().toUpperCase();
    if (p.length === 0) return false;

    const isAreaOnly = /^[A-Z]{1,2}$/.test(p);

    if (isAreaOnly) {
      // e.g. "MK" should match "MK9" but not "M1"
      return p === area && outward.length > area.length;
    } else {
      // e.g. "MK9" should match "MK9" exactly, not "MK91"
      return p === outward;
    }
  });
}
