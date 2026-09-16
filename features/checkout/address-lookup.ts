"use server";

import { lookupAddress } from "@/lib/address-lookup-service";
import type { DeliveryEligibilityStatus } from "@/lib/delivery-eligibility";

/**
 * Checkout's address-lookup server action (#764).
 *
 * Replaces `features/checkout/postcode-lookup.ts`, which called `api.postcodes.io` on every
 * lookup. Nothing here leaves the machine: the answer comes from this application's own
 * Code-Point Open and Open Names tables. That removes a third-party dependency from the checkout
 * path entirely, and removes the question of what happens when somebody else's API is slow.
 *
 * Still a SERVER action rather than a client fetch, and that part is unchanged for the reason #749
 * found the hard way: this app's Content-Security-Policy blocks outbound calls from the browser,
 * so a lookup issued client-side fails silently.
 *
 * ## `"use server"` files may export ONLY async functions
 *
 * Not even a constant, and the restriction is enforced at *runtime* — `next build`, `tsc --noEmit`
 * and the whole test suite stay green with a violating file, while every action in it 500s for
 * every caller (#159). The state shape this returns is a plain type, erased at compile time, which
 * is why it is safe to declare here; anything with a runtime value belongs in a normal module.
 */

/** What checkout needs back from a lookup. Deliberately narrower than the public API body. */
export interface CheckoutAddressLookup {
  status: DeliveryEligibilityStatus;
  postcode: string;
  deliverable: boolean;
  town: string | null;
  county: string | null;
  streetSuggestions: string[];
  /** Always true. Manual entry is never withdrawn, in any state. */
  manualEntryAvailable: true;
}

export type CheckoutLookupOutcome =
  { ok: true; result: CheckoutAddressLookup } | { ok: false; reason: "malformed" | "unavailable" };

/**
 * Look up a postcode for the checkout form.
 *
 * Never throws at the caller: a failure returns `unavailable`, which the form treats as "carry on
 * with manual entry" rather than as a validation error. A lookup problem is ours, not the
 * shopper's, and must never be the reason an order cannot be placed.
 */
export async function lookupAddressForCheckout(postcode: string): Promise<CheckoutLookupOutcome> {
  try {
    const result = await lookupAddress(postcode);
    if (!result) return { ok: false, reason: "malformed" };

    return {
      ok: true,
      result: {
        status: result.eligibility.status,
        postcode: result.eligibility.postcode,
        deliverable: result.eligibility.deliverable,
        town: result.location.town,
        county: result.location.county,
        streetSuggestions: result.location.streetSuggestions,
        manualEntryAvailable: true,
      },
    };
  } catch (error) {
    console.error(
      `checkout address lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ok: false, reason: "unavailable" };
  }
}
