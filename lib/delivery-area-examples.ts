import { postcodeAreaOf } from "@/lib/postcode-normalisation";

/**
 * #905 — example postcodes for the delivery-area admin, taken from the vendor's own geography.
 *
 * The page, the add form and the parser's error messages used to show Milton Keynes examples
 * (`MK`, `MK9`, `MK1-MK10`) to every vendor, so a Reading store was shown another town's
 * postcodes. The example now comes from the vendor's data, in this order:
 *   1. the area of the store's own postcode (`VendorLocation.postcode`), when it parses;
 *   2. otherwise the letters of the alphabetically first delivery area it already serves;
 *   3. otherwise none — each caller then keeps its rule and drops the example clause.
 * Pure — no I/O — so each surface resolves it the same way and a test reaches it directly.
 */

export interface DeliveryAreaExamples {
  /** A whole postcode area, e.g. `RG`. */
  area: string;
  /** One district in it, e.g. `RG1`. */
  district: string;
  /** A comma list of districts, e.g. `RG1, RG3, RG5`. */
  list: string;
  /** A district range, e.g. `RG1-RG10`. */
  range: string;
}

/** The leading letters of an area or district prefix (`RG1` → `RG`), or null if it has none. */
function areaLettersOf(prefix: string): string | null {
  return /^[A-Z]{1,2}/.exec(prefix.trim().toUpperCase())?.[0] ?? null;
}

export function exampleAreaFor(input: {
  storePostcode: string | null;
  deliveryPrefixes: readonly string[];
}): string | null {
  if (input.storePostcode) {
    const area = postcodeAreaOf(input.storePostcode);
    if (area) return area;
  }
  const first = [...input.deliveryPrefixes].sort()[0];
  return first ? areaLettersOf(first) : null;
}

export function deliveryAreaExamples(area: string | null): DeliveryAreaExamples | null {
  if (area === null) return null;
  return {
    area,
    district: `${area}1`,
    list: `${area}1, ${area}3, ${area}5`,
    range: `${area}1-${area}10`,
  };
}
