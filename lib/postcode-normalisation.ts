/**
 * UK postcode normalisation and structural parsing (#764) — pure, DB-free, unit-tested.
 *
 * Same posture as `lib/delivery-area-form.ts` and `lib/shopping-list.ts`: every decision about what
 * a submitted postcode MEANS lives where a test can reach it without a database, a session or a
 * request. Nothing here knows Prisma, `next/headers` or the network exist.
 *
 * ## What this file does NOT decide
 *
 * **Shape is not existence.** `isValidPostcodeShape` answers "could this be a UK postcode?", which
 * is a question about characters. Whether a postcode actually EXISTS is answered solely by an
 * active `PostcodeReference` row sourced from OS Code-Point Open — see `lib/delivery-eligibility.ts`
 * for the state model, including why an uninitialised dataset yields UNVERIFIED rather than invalid.
 * Treating a well-formed-but-unknown postcode as valid, or a malformed one as merely unknown, are
 * both mistakes this separation exists to prevent.
 *
 * The shape check is used for exactly one thing on the request path: rejecting obvious junk at the
 * API boundary before any query runs, so an unauthenticated endpoint cannot be used to issue
 * arbitrary database reads with arbitrary strings.
 */

/**
 * A full UK postcode with the space removed.
 *
 * Outward code: one or two letters, a digit, then optionally a further digit or letter (`MK9`,
 * `SW1A`, `B33`, `EC1A`). Inward code: a digit and two letters, always exactly three characters.
 * Anchored at both ends so nothing trailing survives.
 */
const FULL_POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;

/** Leading letters of the outward code — the postcode AREA (`MK`, `SW`, `B`). */
const POSTCODE_AREA = /^[A-Z]{1,2}/;

/**
 * The longest input worth examining. A real postcode normalises to 5-7 characters; this cap exists
 * so a hostile caller cannot hand the API a megabyte of text to regex over. Generous enough that no
 * legitimate input with stray whitespace is refused.
 */
export const MAX_POSTCODE_INPUT_LENGTH = 16;

/**
 * Upper-case and strip ALL whitespace: `"mk9 2nw"`, `" MK9  2NW "` and `"MK92NW"` all yield
 * `"MK92NW"`.
 *
 * This is the form stored in `PostcodeReference.normalisedPostcode` and the form every lookup keys
 * on, so that how a shopper spaced their typing can never affect whether their postcode is found.
 */
export function normalisePostcode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * Render a normalised postcode in its canonical spaced form: `"MK92NW"` to `"MK9 2NW"`.
 *
 * The inward code is always exactly three characters, so the space always goes three from the end —
 * true regardless of whether the outward code is two, three or four characters long. Input that is
 * not a plausible postcode is returned unchanged rather than mangled; formatting is presentation,
 * and presentation should never be the thing that rejects a value.
 */
export function formatPostcode(raw: string): string {
  const normalised = normalisePostcode(raw);
  if (normalised.length < 5) return normalised;
  return `${normalised.slice(0, -3)} ${normalised.slice(-3)}`;
}

/** True when the input could be a UK postcode. Says nothing about whether it exists. */
export function isValidPostcodeShape(raw: string): boolean {
  if (raw.length > MAX_POSTCODE_INPUT_LENGTH) return false;
  return FULL_POSTCODE.test(normalisePostcode(raw));
}

/**
 * The postcode DISTRICT, also called the outward code: `"MK92NW"` to `"MK9"`, `"SW1A1AA"` to
 * `"SW1A"`.
 *
 * This is the granularity OS Open Names publishes in its own `POSTCODE_DISTRICT` column — "the
 * first two to four characters" — which is exactly why a street suggestion cannot be derived from
 * that column alone. A district can span a large area, so `lib/repositories/places.ts` requires a
 * district match AND a distance ceiling before it will suggest anything.
 *
 * Returns `null` for input that is not a well-formed postcode, so a caller cannot accidentally
 * query on a fragment of junk.
 */
export function postcodeDistrictOf(raw: string): string | null {
  const normalised = normalisePostcode(raw);
  if (!FULL_POSTCODE.test(normalised)) return null;
  return normalised.slice(0, -3);
}

/**
 * The postcode AREA — the leading letters only: `"MK92NW"` to `"MK"`.
 *
 * Matches what `VendorDeliveryArea.prefix` holds when a vendor has declared a whole area rather
 * than individual districts, which is why `lib/delivery.ts` compares at this granularity too.
 */
export function postcodeAreaOf(raw: string): string | null {
  const normalised = normalisePostcode(raw);
  if (!FULL_POSTCODE.test(normalised)) return null;
  return normalised.match(POSTCODE_AREA)?.[0] ?? null;
}
