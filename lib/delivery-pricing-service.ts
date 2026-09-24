import { cache } from "react";
import { cookies } from "next/headers";
import { DELIVERY_POSTCODE_COOKIE } from "@/lib/delivery-cookie";
import { resolveDeliveryRules, type ResolvedDeliveryRules } from "@/lib/delivery-pricing";
import type { VendorProfile } from "@/lib/repositories/vendor";

/**
 * The delivery money rules for the shopper viewing THIS request (#890), from the vendor profile and
 * the `delivery-postcode` cookie — the header's cart drawer, `/cart`, `/checkout` and the landing
 * banner all read it, so a shopper sees one set of charges wherever they look.
 *
 * `place-order` does NOT use this: it prices from the delivery ADDRESS postcode, which is the one
 * that is actually charged, and refuses if that differs from what this quoted (R23).
 *
 * Memoised per request with React `cache()`, keyed by the profile object and method, so the header
 * and a page body in one render resolve once and cannot disagree.
 */
export const getShopperDeliveryRules = cache(
  async (
    profile: VendorProfile | null,
    method: "DELIVERY" | "COLLECTION",
  ): Promise<ResolvedDeliveryRules> => {
    const jar = await cookies();
    const postcode = jar.get(DELIVERY_POSTCODE_COOKIE)?.value ?? null;
    return resolveDeliveryRules(
      {
        deliveryFeePence: profile?.deliveryFeePence ?? 0,
        minimumOrderPence: profile?.minimumOrderPence ?? 0,
        freeDeliveryThresholdPence: profile?.freeDeliveryThresholdPence ?? null,
      },
      profile?.deliveryAreas ?? [],
      postcode,
      method,
    );
  },
);
