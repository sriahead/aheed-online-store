import { cache } from "react";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { evaluateDeliveryEligibility, type DeliveryEligibility } from "@/lib/delivery-eligibility";
import { findPostcode } from "@/lib/repositories/postcodes";
import { CODE_POINT_SOURCE_KEY, findDatasetStatus } from "@/lib/repositories/reference-data";

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
 * The decision itself stays pure and testable in `lib/delivery-eligibility.ts`; this file only
 * resolves the three inputs that need a live request — the vendor, the Code-Point row, and whether
 * the dataset has ever been initialised here.
 *
 * Lives beside `lib/repositories/`, never inside it, so those modules keep the property that a
 * plain `tsx` script can import them. Wrapped in React `cache()` because the header, the cart
 * drawer and the page body all ask within one render and cannot be allowed to disagree; the Prisma
 * client is built fresh per call and never cached across requests.
 */
export const getDeliveryEligibility = cache(
  async (postcode: string): Promise<DeliveryEligibility> => {
    const prisma = getPrisma();

    const [vendor, reference, datasetStatus] = await Promise.all([
      getCurrentVendorProfile(),
      findPostcode(prisma, postcode),
      findDatasetStatus(prisma, CODE_POINT_SOURCE_KEY),
    ]);

    return evaluateDeliveryEligibility({
      postcode,
      deliveryPrefixes: vendor?.deliveryPrefixes ?? [],
      reference,
      referenceInitialised: datasetStatus?.initialised ?? false,
    });
  },
);

/**
 * Whether a postcode is deliverable for the current vendor, as a plain boolean.
 *
 * A convenience for the call sites that only ever needed the yes/no — the header badge and the
 * fulfilment-method default. They keep behaving exactly as they did before this slice, because
 * `deliverable` is computed from vendor configuration alone and does not depend on reference data
 * being loaded.
 */
export async function isPostcodeDeliverable(postcode: string): Promise<boolean> {
  return (await getDeliveryEligibility(postcode)).deliverable;
}
