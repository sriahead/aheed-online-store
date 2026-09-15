"use server";

import {
  lookupPostcode,
  PostcodeNotFoundError,
  type PostcodeLookupOutcome,
} from "@/lib/postcodes-api";

/**
 * Checkout address lookup, moved off the browser (P10, #749).
 *
 * `#613` shipped this as a direct client-side call: `components/checkout/CheckoutForm.tsx` imported
 * `lookupPostcode` and ran its `fetch` in the shopper's browser. Every deployed environment sends
 * `connect-src 'self' https://*.r2.cloudflarestorage.com`, so the request to `api.postcodes.io` was
 * blocked by CSP before it left the page — and the caller's own catch treated the block as a
 * transient API failure and swallowed it with `console.warn`. The feature therefore never worked
 * anywhere, and looked like it was merely falling back.
 *
 * Running it here rather than widening CSP is deliberate. The endpoint needs no key and returns
 * public data, so a permanent hole in `connect-src` would buy nothing this does not, while
 * permanently weakening the policy for every other script on the page.
 *
 * Outcomes are RETURNED, never thrown. A production throw crossing a server-action boundary reaches
 * the client as an opaque digest, so the `err.name === "PostcodeNotFoundError"` branch this replaces
 * could not have worked on a deployed environment even with the network available.
 *
 * No auth check: this reads a public postcode database and touches nothing vendor-scoped. It is
 * reachable by anyone who can open checkout, which is already anyone at all.
 */
export async function lookupPostcodeForCheckout(postcode: string): Promise<PostcodeLookupOutcome> {
  try {
    const result = await lookupPostcode(postcode);
    return { ok: true, result };
  } catch (error) {
    if (error instanceof PostcodeNotFoundError) return { ok: false, reason: "not-found" };
    return { ok: false, reason: "unavailable" };
  }
}
