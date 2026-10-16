import {
  resolveDeliveryRules,
  type DeliveryAreaCharges,
  type DeliveryMoneyRules,
  type VendorDeliveryDefaults,
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
  /**
   * Collection is never per-area. Since #1083 this is the vendor's own collection minimum, which
   * `resolveDeliveryRules` returns for COLLECTION, not the delivery minimum.
   */
  collectionMinimumOrderPence: number;
}

/** Is free delivery offered at this threshold at all? `null` and `0` both mean no. */
export function freeDeliveryOffered(thresholdPence: number | null): boolean {
  return thresholdPence !== null && thresholdPence > 0;
}

/**
 * How points expiry actually works, in one sentence (#1045).
 *
 * `/help` and the help assistant both dated expiry from the moment a point was earned, which
 * describes per-point aging the platform has never implemented. `lib/loyalty.ts`'s `isLapsed()`
 * lapses the WHOLE balance once `lastActivityAt + pointsExpiryMonths` passes: expiry is
 * inactivity-based, so a shopper who keeps ordering never loses a point, and one who stops loses
 * everything at once — including points earned the day before their last order. That is deliberate
 * (it makes expiry derivable from one column at read time, with no scheduled sweep, which P5a chose
 * because this codebase has no cron surface), so the copy is what was wrong, not the rule.
 *
 * WHY IT LIVES HERE. This module is already imported by both surfaces that state the rule —
 * `app/(storefront)/help/page.tsx` and `lib/assistant-content.ts`, the second of which copied its
 * wording from the first in #1015. #1045 asked for a test pinning the two sentences together; one
 * source makes them incapable of drifting instead, which is the same request's stronger form.
 *
 * The second sentence is not padding: without it a shopper has no way to know the deadline moves.
 * `app/(storefront)/account/loyalty/page.tsx` shows each shopper their own computed date, so this
 * states the rule rather than a date — neither caller has a shopper in context.
 */
export function pointsExpirySentence(months: number): string {
  return `Points expire if your account goes ${months} months without an order. Placing an order resets the clock.`;
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
  vendorDefaults: VendorDeliveryDefaults,
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
