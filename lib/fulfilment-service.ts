import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentVendorProfile } from "./vendor-service";
import { DELIVERY_POSTCODE_COOKIE } from "./delivery-cookie";
import { isPostcodeDeliverable } from "./delivery-eligibility-service";
import {
  FULFILMENT_METHOD_COOKIE,
  defaultFulfilmentMethod,
  parseFulfilmentMethod,
  type FulfilmentMethodChoice,
} from "./fulfilment-cookie";

/**
 * Request-scoped resolution of the shopper's effective fulfilment method (#748).
 *
 * This is the request-context wrapper that sits BESIDE the pure module rather
 * than inside it — same split as `lib/auth-rbac.ts` / `lib/data-rights-service.ts`.
 * `lib/fulfilment-cookie.ts` holds the cookie name, the parser and the default
 * rule, and reads nothing; this file is the only place that touches `cookies()`.
 *
 * ## Why "effective" and not just "stored"
 *
 * The cookie records a PREFERENCE. What actually applies also depends on the
 * vendor, and the vendor can change under a cookie that was set months ago — a
 * vendor that turns Click & Collect off must not leave shoppers holding a
 * COLLECTION preference that no longer exists, in exactly the way
 * `features/storefront/delivery.ts` refuses to store the deliverable/not verdict
 * alongside the postcode. Derived per request, one source of truth.
 *
 * Wrapped in React's `cache()` for the same reason `getCurrentVendorProfile` is:
 * the header, the cart drawer and the page body all ask this within one render,
 * and the answer cannot legitimately differ between them.
 */
export const getFulfilmentMethod = cache(async (): Promise<FulfilmentMethodChoice> => {
  const [profile, jar] = await Promise.all([getCurrentVendorProfile(), cookies()]);

  // A vendor that does not offer collection is DELIVERY, whatever the cookie
  // says. Checked BEFORE the cookie, not after, so a stale or crafted
  // COLLECTION value can never select a method this vendor does not operate.
  if (!profile?.offerCollection) return "DELIVERY";

  const stored = parseFulfilmentMethod(jar.get(FULFILMENT_METHOD_COOKIE)?.value);
  if (stored !== null) return stored;

  // No preference expressed. Fall back to the rule LocationControl used to
  // compute locally, so shoppers who have never touched the toggle are
  // unaffected by this slice.
  // #764 — routed through the one eligibility service rather than calling `isDeliverable` here.
  // Unchanged in behaviour: `deliverable` still comes from this vendor's current prefixes and
  // needs no reference data, so an environment that has never synced answers exactly as before.
  const postcode = jar.get(DELIVERY_POSTCODE_COOKIE)?.value ?? null;
  const deliverable = postcode ? await isPostcodeDeliverable(postcode) : false;
  return defaultFulfilmentMethod(deliverable, profile.offerCollection);
});
