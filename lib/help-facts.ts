import {
  resolveDeliveryRules,
  type DeliveryAreaCharges,
  type DeliveryMoneyRules,
} from "@/lib/delivery-pricing";

/**
 * The Help Centre's delivery and collection facts (P10, #1013) — pure, DB-free, unit-testable.
 *
 * WHY THIS EXISTS. `/help` used to state these facts as platform-written prose: "A minimum order
 * value is required for delivery", "Every purchase earns you points automatically". Both are
 * claims, and both are false for some tenant — `minimumOrderPence` defaults to `0` (no minimum)
 * and `loyaltyEnabled` defaults to `false`. SriMart, with loyalty off, was serving the loyalty
 * promise in production on 2026-10-10. Same defect class as #239.
 *
 * WHY EVERY FIGURE GOES THROUGH `resolveDeliveryRules`. `VendorProfile`'s own docstring says to
 * resolve charges with it and "never by reading the three vendor-wide fields directly", because
 * since #890 any `VendorDeliveryArea` row may override the fee, the minimum and the threshold
 * independently, and a district row beats an area row. `/help` has no postcode and no basket, so it
 * cannot resolve one shopper's charges — it resolves EVERY area's and reports the variation. A
 * single flat figure presented as universal would just be a new false claim replacing the old one.
 *
 * `0` AND `null` BOTH MEAN "FREE DELIVERY NOT OFFERED", which is `lib/delivery-pricing.ts`'s
 * documented rule and the one `computeTotals` and `fulfilmentProgress` already follow. `#892` is
 * open because the store-admin guide claims a `0` threshold makes every order free; this module
 * follows the code, not that guide.
 */

/** One area's fully-resolved money, with the prefix a shopper would recognise. */
export interface HelpAreaFacts {
  prefix: string;
  deliveryFeePence: number;
  minimumOrderPence: number;
  freeDeliveryThresholdPence: number | null;
}

export interface HelpDeliveryFacts {
  /** The vendor-wide figures, used wherever no area overrides them. */
  defaults: DeliveryMoneyRules;
  /** Every delivery area with its effective figures, in the order a shopper reads them. */
  areas: HelpAreaFacts[];
  /** Which of the three figures differ between areas, so the page knows what to break out. */
  varies: { fee: boolean; minimum: boolean; threshold: boolean };
  /** Collection is never per-area: `resolveDeliveryRules` returns the defaults for COLLECTION. */
  collectionMinimumOrderPence: number;
}

/** Is free delivery offered at this threshold at all? `null` and `0` both mean no. */
export function freeDeliveryOffered(thresholdPence: number | null): boolean {
  return thresholdPence !== null && thresholdPence > 0;
}

/**
 * A postcode that `matchDeliveryArea` will match to this row, so the row's own overrides resolve.
 *
 * A district prefix (`MK9`) already matches as written — the matcher compares it to a postcode's
 * outward code. A bare area prefix (`MK`) does NOT: that branch requires the outward code to be
 * longer than the area letters, so "MK" alone matches nothing. Appending a digit gives the matcher
 * what it needs, the same `${area}1` convention `lib/delivery-area-examples.ts` already uses for
 * display. Nothing here is shown to a shopper; it exists only to drive the resolver.
 */
function representativePostcodeFor(prefix: string): string {
  const trimmed = prefix.trim().toUpperCase();
  return /^[A-Z]{1,2}$/.test(trimmed) ? `${trimmed}1` : trimmed;
}

export function helpDeliveryFacts(
  vendorDefaults: DeliveryMoneyRules,
  areas: readonly DeliveryAreaCharges[],
): HelpDeliveryFacts {
  const resolvedAreas: HelpAreaFacts[] = areas.map((area) => {
    const rules = resolveDeliveryRules(
      vendorDefaults,
      areas,
      representativePostcodeFor(area.prefix),
      "DELIVERY",
    );
    return {
      prefix: area.prefix.trim().toUpperCase(),
      deliveryFeePence: rules.deliveryFeePence,
      minimumOrderPence: rules.minimumOrderPence,
      freeDeliveryThresholdPence: rules.freeDeliveryThresholdPence,
    };
  });

  // Variation is measured against the defaults as well as between areas: one area overriding the
  // store-wide fee is a variation even when it is the only area, because the page would otherwise
  // print the default and be wrong for the only place this vendor delivers to.
  const feeValues = new Set<number>([
    vendorDefaults.deliveryFeePence,
    ...resolvedAreas.map((area) => area.deliveryFeePence),
  ]);
  const minimumValues = new Set<number>([
    vendorDefaults.minimumOrderPence,
    ...resolvedAreas.map((area) => area.minimumOrderPence),
  ]);
  const thresholdValues = new Set<number | null>([
    vendorDefaults.freeDeliveryThresholdPence,
    ...resolvedAreas.map((area) => area.freeDeliveryThresholdPence),
  ]);

  const collection = resolveDeliveryRules(vendorDefaults, areas, null, "COLLECTION");

  return {
    defaults: {
      deliveryFeePence: vendorDefaults.deliveryFeePence,
      minimumOrderPence: vendorDefaults.minimumOrderPence,
      freeDeliveryThresholdPence: vendorDefaults.freeDeliveryThresholdPence,
    },
    areas: resolvedAreas,
    varies: {
      fee: feeValues.size > 1,
      minimum: minimumValues.size > 1,
      threshold: thresholdValues.size > 1,
    },
    collectionMinimumOrderPence: collection.minimumOrderPence,
  };
}
