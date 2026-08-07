// Any Milton Keynes (MK) postcode district — MK1 through MK99 — e.g. MK9, MK19, MK24.
// Deliberately broad: the precise per-vendor delivery footprint becomes DB-driven config
// (ADR-004 / #49); until then we accept the whole MK area rather than a hardcoded shortlist.
const MILTON_KEYNES_DISTRICT = /^MK[1-9][0-9]?(?:\d[A-Z]{0,2})?$/;

/**
 * True for any well-formed Milton Keynes (MK) postcode — the currently deliverable area.
 * Pure, no persistence/network — P3's checkout flow decides what to do with the result.
 */
export function isDeliverable(postcode: string): boolean {
  const normalized = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return false;
  return MILTON_KEYNES_DISTRICT.test(normalized);
}
