import type { ParseResult } from "@/lib/catalogue-form";

/**
 * Social & contact field rules (P9.2, #407 / #405) — pure, DB-free, unit-tested.
 *
 * Same posture as `lib/delivery-rules-form.ts` (#634) and `lib/catalogue-form.ts`: every decision
 * about what a submitted field MEANS lives where a test can reach it without a database, a session
 * or a request. `features/admin/storefront.ts` does the reading and the repository call; nothing
 * here knows either exists.
 *
 * ## Why the URL rule is an allow-list rather than a sanity check
 *
 * These are the first vendor-editable values in this repo that land directly inside an `href`. A
 * stored `javascript:` URL is a live script link for every visitor to that storefront, and
 * `new URL()` parses it perfectly happily — parsing successfully is not the same as being safe to
 * render. So the accepted set is exactly one scheme, `https:`, and everything else is refused by
 * name rather than by absence.
 *
 * `http:` is refused too, which is stricter than "not dangerous": an HTTP link from an HTTPS
 * storefront is a downgrade the browser will warn about, and no social network this targets is
 * HTTP-only.
 *
 * ## Why blank is a success, not an error
 *
 * `null` is a real, meaningful value for all three columns — it HIDES that element rather than
 * falling back to a platform default (#239, and the `bannerNote`/`heroSubtitle` precedent in the
 * same model). An operator clearing a field is doing something deliberate, so blank parses to
 * `null` and only a non-blank, non-conforming value is an error.
 *
 * Errors are RETURNED, never thrown — a mistyped URL is an ordinary thing for a human to type, and
 * the form has to re-render with the field named.
 */

/**
 * Digits only, no `+`, no separators, and **never a leading zero**. `wa.me` takes E.164 without
 * the leading plus, and an E.164 number always starts with a country code — so a national-format
 * number like the UK's `07448894146` is 11 digits of pure numerals that `wa.me` still cannot
 * resolve. It opens WhatsApp and no chat starts, with no error anywhere. Found live: the first
 * number ever entered through the admin form was exactly that shape, and the original rule
 * (`^\d{7,15}$`) accepted it.
 */
const WHATSAPP_DIGITS = /^[1-9]\d{6,14}$/;

/** The only URL scheme a stored social link may use. */
const ALLOWED_URL_SCHEME = "https:";

export const FACEBOOK_URL_FIELD = "facebookUrl";
export const INSTAGRAM_URL_FIELD = "instagramUrl";
export const WHATSAPP_NUMBER_FIELD = "whatsappNumber";

/** What the repository is asked to write. `null` clears (and therefore hides) the element. */
export interface SocialContactInput {
  facebookUrl: string | null;
  instagramUrl: string | null;
  whatsappNumber: string | null;
}

/**
 * `useActionState` shape, matching `DeliveryRulesFormState`. Lives here rather than in
 * `features/admin/storefront.ts` because a `"use server"` file may export ONLY async functions —
 * a same-file value export makes every action in it fail at runtime (#159), and nothing in
 * `lint`/`typecheck`/`test` catches it.
 */
export interface SocialContactFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

export const initialSocialContactState: SocialContactFormState = {
  error: null,
  field: null,
  saved: false,
};

/**
 * An https URL, or `null` when blank. Anything else is a returned error naming `field`.
 */
export function parseSocialUrl(
  raw: string,
  field: string,
  label: string,
): ParseResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: { field, message: `Enter a full ${label} address starting with https://` },
    };
  }

  // Scheme first: `new URL("javascript:alert(1)")` parses, so a successful parse
  // proves nothing about whether this is safe to put in an href.
  if (parsed.protocol !== ALLOWED_URL_SCHEME) {
    return {
      ok: false,
      error: { field, message: `${label} links must start with https://` },
    };
  }

  if (parsed.hostname === "") {
    return {
      ok: false,
      error: { field, message: `Enter a full ${label} address starting with https://` },
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * A digits-only phone number of 7 to 15 digits, or `null` when blank.
 */
export function parseWhatsappNumber(raw: string, field: string): ParseResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };

  if (!WHATSAPP_DIGITS.test(trimmed)) {
    // A leading zero is the mistake an operator actually makes — they type the number the way
    // they'd dial it locally — so it gets its own message naming the fix rather than the
    // generic one.
    if (/^0\d+$/.test(trimmed)) {
      return {
        ok: false,
        error: {
          field,
          message:
            "Drop the leading 0 and start with your country code — a UK number like 07448894146 becomes 447448894146. WhatsApp cannot open a chat from a national-format number.",
        },
      };
    }

    return {
      ok: false,
      error: {
        field,
        message:
          "Enter the number in international format using digits only — no plus sign, spaces or dashes (e.g. 447700900123).",
      },
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * All three at once. The first failing field wins, so the form points at one input at a time —
 * same behaviour as `parseDeliveryRules`.
 */
export function parseSocialContact(raw: {
  facebookUrl: string;
  instagramUrl: string;
  whatsappNumber: string;
}): ParseResult<SocialContactInput> {
  const facebook = parseSocialUrl(raw.facebookUrl, FACEBOOK_URL_FIELD, "Facebook");
  if (!facebook.ok) return facebook;

  const instagram = parseSocialUrl(raw.instagramUrl, INSTAGRAM_URL_FIELD, "Instagram");
  if (!instagram.ok) return instagram;

  const whatsapp = parseWhatsappNumber(raw.whatsappNumber, WHATSAPP_NUMBER_FIELD);
  if (!whatsapp.ok) return whatsapp;

  return {
    ok: true,
    value: {
      facebookUrl: facebook.value,
      instagramUrl: instagram.value,
      whatsappNumber: whatsapp.value,
    },
  };
}
