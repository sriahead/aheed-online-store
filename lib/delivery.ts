const LEICESTER_DISTRICT = /^LE[1-5](?:\d[A-Z]{0,2})?$/;

/**
 * True for any UK postcode whose district falls within Leicester's LE1–LE5 —
 * the only area currently deliverable. Pure, no persistence/network — P3's
 * checkout flow decides what to do with the result.
 */
export function isDeliverable(postcode: string): boolean {
  const normalized = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return false;
  return LEICESTER_DISTRICT.test(normalized);
}
