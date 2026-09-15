import { cache } from "react";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { evaluateDeliveryEligibility, type DeliveryEligibility } from "@/lib/delivery-eligibility";
import { lookupPostcodeReference } from "@/lib/reference/postcode-reference-service";

/**
 * Request-scoped delivery eligibility (#764) — the single answer to "can this vendor deliver here?".
 *
 * This is the consolidation the slice exists to make. The question used to be asked in three
 * places, each reaching for `lib/delivery.ts`'s `isDeliverable` directly:
 * `components/layout/Header.tsx` (the delivery badge), `features/checkout/place-order.ts` (the hard
 * checkout gate) and `lib/fulfilment-service.ts` (the default fulfilment method). Three call sites
 * meant three opportunities to drift, and the most damaging drift is the quiet one where the header
 * tells a shopper they are in the delivery area and checkout then refuses their order.
 *
 * It joins the two independently-owned halves and does nothing else:
 *
 * - **does the postcode exist** — from `lib/reference/`, against the shared reference database;
 * - **does this vendor deliver there** — from the vendor's own `VendorDeliveryArea` prefixes.
 *
 * The decision itself stays pure and testable in `lib/delivery-eligibility.ts`. Wrapped in React
 * `cache()` because the header, the cart drawer and the page body all ask within one render and
 * cannot be allowed to disagree — and, now that reference data lives in a separate database, so
 * that one render costs at most one reference round trip per postcode.
 */
export const getDeliveryEligibility = cache(
  async (postcode: string): Promise<DeliveryEligibility> => {
    const [vendor, reference] = await Promise.all([
      getCurrentVendorProfile(),
      lookupPostcodeReference(postcode),
    ]);

    return evaluateDeliveryEligibility({
      postcode,
      deliveryPrefixes: vendor?.deliveryPrefixes ?? [],
      referenceStatus: reference.status,
      areaCovered: reference.areaCovered,
    });
  },
);

/**
 * Whether a postcode is deliverable for the current vendor, as a plain boolean.
 *
 * A convenience for the call sites that only ever needed the yes/no — the header badge and the
 * fulfilment-method default. They keep behaving exactly as they did before this slice, because
 * `deliverable` is computed from vendor configuration alone and does not depend on the reference
 * database being reachable or the area being covered.
 */
export async function isPostcodeDeliverable(postcode: string): Promise<boolean> {
  return (await getDeliveryEligibility(postcode)).deliverable;
}
