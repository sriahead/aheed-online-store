// Milton Keynes covers postcode districts MK1–MK19 (MK40+ is Bedford, not local).
const MILTON_KEYNES_DISTRICT = /^MK(1[0-9]|[1-9])(?:\d[A-Z]{0,2})?$/;

/**
 * True for any UK postcode whose district falls within Milton Keynes' MK1–MK19 —
 * the only area currently deliverable. Pure, no persistence/network — P3's
 * checkout flow decides what to do with the result.
 */
export function isDeliverable(postcode: string): boolean {
  const normalized = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return false;
  return MILTON_KEYNES_DISTRICT.test(normalized);
}
