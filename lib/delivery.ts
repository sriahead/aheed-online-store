// Vendor delivery footprint is DB-driven (ADR-004 slice 4): a vendor's VendorDeliveryArea rows each
// hold a postcode AREA ("MK" — every district in Milton Keynes) or a DISTRICT ("MK9" — exactly that
// outward code). Matching compares strings; nothing stored is ever interpreted as a pattern.
//
// Pure — no Prisma/network — so callers fetch the rows (via lib/repositories/vendor) and pass them
// in. `lib/delivery-eligibility.ts` is the only caller of `isDeliverable`; `lib/delivery-pricing.ts`
// is the only caller of `matchDeliveryArea` (#890).

/** The part of a delivery-area row the matcher needs. Extra fields are carried through untouched. */
export interface DeliveryAreaPrefix {
  prefix: string;
}

/**
 * The shopper's outward code ("MK9" from "mk9 2ea"), or null for input with no leading area letters.
 * A full postcode's inward code is exactly three characters starting with a digit; anything shorter
 * is treated as an outward code already.
 */
function outwardCode(postcode: string): { outward: string; area: string } | null {
  const normalized = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;

  let outward = normalized;
  if (normalized.length >= 5 && /^[0-9]/.test(normalized.slice(-3))) {
    outward = normalized.slice(0, -3);
  }

  const match = outward.match(/^([A-Z]{1,2})/);
  if (!match) return null;
  return { outward, area: match[1] };
}

/**
 * The delivery-area row that covers this postcode, or null (#613, #890).
 *
 * - An AREA row ("MK") covers every district in it: "MK9 2EA" and "MK17 8NL", but not "M1 1AA" and
 *   not a bare "MK" with no district digit.
 * - A DISTRICT row ("MK9") covers exactly that outward code: "MK9 2EA", never "MK91" or "MK17".
 *
 * When both an area row and a district row cover the postcode, the DISTRICT row is returned — it is
 * the more specific statement, and it is the row whose per-area charges apply.
 */
export function matchDeliveryArea<T extends DeliveryAreaPrefix>(
  postcode: string,
  areas: readonly T[],
): T | null {
  const code = outwardCode(postcode);
  if (!code || areas.length === 0) return null;

  let areaMatch: T | null = null;
  for (const row of areas) {
    const p = row.prefix.trim().toUpperCase();
    if (p.length === 0) continue;

    if (/^[A-Z]{1,2}$/.test(p)) {
      if (p === code.area && code.outward.length > code.area.length) areaMatch ??= row;
    } else if (p === code.outward) {
      return row;
    }
  }
  return areaMatch;
}

export function isDeliverable(postcode: string, prefixes: string[]): boolean {
  return (
    matchDeliveryArea(
      postcode,
      prefixes.map((prefix) => ({ prefix })),
    ) !== null
  );
}
