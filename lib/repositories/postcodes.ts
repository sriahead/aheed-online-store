// Type-only: a value import of "@prisma/client/wasm" is unresolvable under vitest, and this file
// needs nothing from it at runtime.
import type { getPrisma } from "@/lib/db";
import { normalisePostcode } from "@/lib/postcode-normalisation";

/**
 * Postcode reference reads (#764) — the ONLY DB access for `PostcodeReference`.
 *
 * Every export takes `prisma` as an explicit parameter and reads no request context (#252,
 * #409/#411/#412), so a plain `tsx` script can exercise this module in real Node. The
 * request-scoped facade lives in `lib/address-lookup-service.ts`, beside this file rather than
 * inside it.
 *
 * **Not vendor-scoped, deliberately.** A postcode is the same fact for every vendor, so these rows
 * carry no `vendorId` and no export takes one. That is the case ADR-004 decision 1 anticipated when
 * it described reference tables; it is not a gap in tenancy isolation. Vendor-specific judgement
 * about a postcode — whether this shop delivers there — lives in `lib/delivery-eligibility.ts` and
 * never here.
 */

type Db = ReturnType<typeof getPrisma>;

export interface PostcodeReferenceRow {
  normalisedPostcode: string;
  displayPostcode: string;
  postcodeArea: string;
  postcodeDistrict: string;
  eastings: number;
  northings: number;
  adminDistrictCode: string | null;
  adminCountyCode: string | null;
  countryCode: string | null;
}

/**
 * Look up one postcode, ignoring how the caller spaced or cased it.
 *
 * Returns `null` both for "no such row" and for a row that has been retired (`isActive = false`) —
 * a withdrawn postcode should stop being offered, and to a caller that is the same answer as never
 * having existed. The row is kept rather than deleted so an address already holding it remains
 * explicable; that is a data-retention decision, not a lookup one.
 */
export async function findPostcode(
  prisma: Db,
  postcode: string,
): Promise<PostcodeReferenceRow | null> {
  const normalised = normalisePostcode(postcode);
  if (normalised === "") return null;

  return prisma.postcodeReference.findFirst({
    where: { normalisedPostcode: normalised, isActive: true },
    select: {
      normalisedPostcode: true,
      displayPostcode: true,
      postcodeArea: true,
      postcodeDistrict: true,
      eastings: true,
      northings: true,
      adminDistrictCode: true,
      adminCountyCode: true,
      countryCode: true,
    },
  });
}

/**
 * How many active postcodes are held. Used by the bootstrap documentation's verification step and
 * by operational checks — never on the request path.
 */
export async function countActivePostcodes(prisma: Db): Promise<number> {
  return prisma.postcodeReference.count({ where: { isActive: true } });
}
