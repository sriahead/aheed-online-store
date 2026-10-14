/**
 * Delivery-postcode cookie name and input normalisation (P8.5f).
 *
 * Pure and DB-free, and deliberately NOT inside `features/storefront/delivery.ts`
 * — that file is `"use server"`, where every export must be an async function
 * (CLAUDE.md's Server Actions section). `Header` needs the cookie name to read
 * the value, so the constant has to live somewhere a Server Component can import
 * it without pulling in the action module. Same reason
 * `lib/campaign-form.ts` holds `initialCampaignFormState`.
 *
 * The deliverability RULE itself stays in `lib/delivery.ts` (`isDeliverable`),
 * unchanged and already unit-tested — this module only decides what a raw text
 * input is worth storing.
 */

/** Longest valid UK postcode is 8 characters including the space ("EC1A 1BB"). */
const MAX_POSTCODE_LENGTH = 8;

export const DELIVERY_POSTCODE_COOKIE = "delivery-postcode";

/**
 * Which affordance opened the postcode modal (#1087).
 *
 * `setDeliveryPostcode` writes the fulfilment method only for `"delivery"`. The
 * distinction is `#748`'s own: asking to have an order delivered is not the same
 * action as correcting where you live, and only the first one is a statement
 * about the method. Carried as a form field rather than read from client state,
 * so the action decides and nothing in the browser is trusted.
 */
export const POSTCODE_INTENT_FIELD = "intent";

export type PostcodeIntent = "delivery" | "edit";

/**
 * `"delivery"` for exactly that string, `"edit"` for everything else.
 *
 * Defaulting to `"edit"` is the safe direction: `"edit"` is the behaviour that
 * existed before this slice, so an absent, unrecognised or crafted value leaves
 * the shopper's stored method alone instead of switching it. Case-sensitive for
 * the same reason `parseFulfilmentMethod` is — the only producer is our own
 * hidden input.
 */
export function parsePostcodeIntent(raw: string | null | undefined): PostcodeIntent {
  return raw === "delivery" ? "delivery" : "edit";
}

/**
 * Trim, upper-case, collapse internal whitespace, and drop anything that can't
 * appear in a UK postcode. Returns `""` for input worth nothing — which the
 * action treats as "forget it" rather than storing junk in a cookie.
 *
 * Deliberately NOT a full postcode-format validation: `isDeliverable()` already
 * decides what actually counts, and rejecting typos here would mean a shopper
 * gets no ✗ feedback at all — just a silently ignored form.
 */
export function normalisePostcodeInput(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, MAX_POSTCODE_LENGTH);
}
