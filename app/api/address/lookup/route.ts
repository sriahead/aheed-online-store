import { lookupAddress, toPublicJson } from "@/lib/address-lookup-service";
import { MAX_POSTCODE_INPUT_LENGTH, isValidPostcodeShape } from "@/lib/postcode-normalisation";

/**
 * `GET /api/address/lookup?postcode=...` (#764).
 *
 * The provider-neutral address-assistance endpoint. Resolves the current vendor from the request
 * host, so two vendors can legitimately return different `deliverable` verdicts for one postcode.
 *
 * ## What it will and will not tell you
 *
 * - `valid` is true only when OS Code-Point Open confirms the postcode exists. It is **not** a
 *   claim that an unconfirmed postcode is fake — read `status` for that. `UNVERIFIED` means this
 *   environment has not yet imported reference data and genuinely could not check; a client must
 *   treat it as "unknown" and must not show the shopper a validation error.
 * - `deliverable` comes from the vendor's own delivery areas and is meaningful in every state,
 *   because it needs no reference data.
 * - `location` is enrichment from OS Open Names: a town, district and county in words rather than
 *   administrative codes, WGS84 coordinates, and up to three nearby street names. Street
 *   suggestions are suggestions about where the postcode is — never evidence that a property is on
 *   that street — and are suppressed entirely when the result would be ambiguous.
 * - `addresses` is reserved strictly for genuine property-level candidates and is **empty** until a
 *   licensed provider exists. Street-level hints must never be placed here: a candidate with no
 *   house number is not an address, and a shopper clicking one gets a form that looks complete and
 *   is not.
 * - `manualEntryAvailable` is always true. Manual entry is never withdrawn, in any state.
 *
 * No internal identifier, source version, grid coordinate or provider schema detail is exposed —
 * `toPublicJson` builds the body field by field rather than spreading an internal object, so a new
 * internal field cannot leak by accident.
 *
 * ## Abuse posture
 *
 * Public and unauthenticated, because checkout needs it before a shopper has an account. The
 * defence is input rejection **before any query runs**: anything that is not shaped like a UK
 * postcode is refused on shape and length, so the endpoint cannot be used to issue arbitrary reads
 * with arbitrary strings. Every path it does take is a bounded, indexed read of local data with no
 * external call and no per-request cost, unlike the AI endpoints this repository rate-limits.
 *
 * No `Cache-Control` is set. `#599` established that such a header does not by itself produce
 * Cloudflare edge caching for a Worker route, and claiming a cache this route does not have would
 * be worse than claiming none.
 */

// Resolves the vendor from the request host and reads per-request data — never statically rendered.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("postcode");

  // Rejected before any repository call, deliberately. `isValidPostcodeShape` caps length itself,
  // but the explicit check here documents that the cheap test comes first.
  if (!raw || raw.length > MAX_POSTCODE_INPUT_LENGTH || !isValidPostcodeShape(raw)) {
    return Response.json(
      { error: "Provide a valid UK postcode in the `postcode` query parameter." },
      { status: 400 },
    );
  }

  const result = await lookupAddress(raw);
  if (!result) {
    return Response.json(
      { error: "Provide a valid UK postcode in the `postcode` query parameter." },
      { status: 400 },
    );
  }

  return Response.json(toPublicJson(result), { status: 200 });
}
