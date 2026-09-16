import { cache } from "react";
import { getReferencePrisma, isReferenceDatabaseConfigured } from "@/lib/reference-db";
import { eastingsNorthingsToWgs84 } from "@/lib/osgb36";
import {
  isValidPostcodeShape,
  normalisePostcode,
  postcodeAreaOf,
} from "@/lib/postcode-normalisation";
import { findPostcode, type PostcodeReferenceRow } from "@/lib/repositories/postcodes";
import { findPlacesNear, rankNearbyStreets, resolveLocality } from "@/lib/repositories/places";
import { isAreaCovered } from "@/lib/repositories/reference-coverage";
import { CODE_POINT_SOURCE_KEY, findDatasetStatus } from "@/lib/repositories/reference-data";

/**
 * The reference-data service boundary (#764).
 *
 * ```
 * OS Downloads API -> uk-location-reference -> THIS SERVICE -> Aheed
 *                                                           -> DeliveryEligibilityService
 *                                                           -> checkout / address forms
 * ```
 *
 * Everything Aheed knows about postcodes and places comes through here. Nothing in `app/`,
 * `components/` or `features/` touches the reference Prisma client, the reference schema, or any
 * reference table — so the reference database can be reshaped, moved, or eventually put behind a
 * network API without any of those files changing.
 *
 * ## What this service answers, and what it deliberately does not
 *
 * It answers: **is this postcode covered and current, where is it, and what reliable enrichment
 * exists?**
 *
 * It does **not** own vendor delivery eligibility. Whether a particular shop delivers to a postcode
 * is Aheed's question about Aheed's configuration, answered in `lib/delivery-eligibility.ts` from
 * that vendor's own `VendorDeliveryArea` rows. Nothing in this directory reads vendor data, and it
 * must stay that way — the reference database is shared platform infrastructure, and a tenant's
 * commercial rules have no business in it.
 *
 * ## Coverage-aware validity, and why failure is never INVALID
 *
 * | Condition | Verdict |
 * |---|---|
 * | Area materialised, active row found | `VALID` |
 * | Area materialised, no active row | `INVALID` |
 * | Area not materialised | `UNVERIFIED` |
 * | No reference database configured | `UNVERIFIED` |
 * | Reference database unreachable, or any other failure | `UNVERIFIED` |
 *
 * Moving reference data into its own database bought a runtime dependency, and every way that
 * dependency can fail resolves to `UNVERIFIED` — never `INVALID`, and never an unhandled error.
 * An infrastructure or coverage gap must degrade to manual address entry, not to telling a customer
 * their address is wrong. That is why the whole body is wrapped in a try/catch that swallows to
 * `unverified()`: a thrown error here would become a 500 on the checkout path.
 *
 * Wrapped in React `cache()` so one render performs at most one reference round trip per postcode —
 * the header, the form and the summary can all ask, and a network hop per asker would be a real
 * cost now that this is a separate database.
 */

export type PostcodeStatus = "VALID" | "INVALID" | "UNVERIFIED";

export interface ReferenceLocation {
  town: string | null;
  district: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  streetSuggestions: string[];
}

export interface PostcodeReferenceResult {
  status: PostcodeStatus;
  /** Canonical spaced form of what was asked about. */
  postcode: string;
  /** The postcode AREA, when the input was well-formed enough to have one. */
  postcodeArea: string | null;
  /** Whether that area is currently materialised. False whenever the answer is UNVERIFIED. */
  areaCovered: boolean;
  location: ReferenceLocation;
  /** Present only for a VALID postcode; the raw grid position, for callers that need it. */
  reference: PostcodeReferenceRow | null;
}

const EMPTY_LOCATION: ReferenceLocation = {
  town: null,
  district: null,
  county: null,
  latitude: null,
  longitude: null,
  streetSuggestions: [],
};

function unverified(postcode: string, area: string | null): PostcodeReferenceResult {
  return {
    status: "UNVERIFIED",
    postcode,
    postcodeArea: area,
    areaCovered: false,
    location: EMPTY_LOCATION,
    reference: null,
  };
}

/**
 * Resolve a postcode against the reference database.
 *
 * Malformed input is the one case answered without any database access at all — whether a string
 * could be a postcode is a question about characters, independent of coverage or connectivity.
 */
export const lookupPostcodeReference = cache(
  async (rawPostcode: string): Promise<PostcodeReferenceResult> => {
    const normalised = normalisePostcode(rawPostcode);
    const area = postcodeAreaOf(normalised);

    if (!isValidPostcodeShape(normalised) || !area) {
      return {
        status: "INVALID",
        postcode: normalised,
        postcodeArea: null,
        areaCovered: false,
        location: EMPTY_LOCATION,
        reference: null,
      };
    }

    // Asked before constructing a client, so an unconfigured environment costs nothing and throws
    // nothing. `getReferenceEnv()` throws on an absent URL, which is why this is a helper rather
    // than a bare property check (#618/#621's shape).
    if (!isReferenceDatabaseConfigured()) return unverified(normalised, area);

    try {
      const prisma = getReferencePrisma();

      const [covered, datasetStatus] = await Promise.all([
        isAreaCovered(prisma, CODE_POINT_SOURCE_KEY, area),
        findDatasetStatus(prisma, CODE_POINT_SOURCE_KEY),
      ]);

      // Both conditions matter. An area can be listed as covered only if the dataset itself has
      // completed at least one successful sync, but checking the dataset too means a database
      // restored from an odd state cannot present stale coverage as authority.
      if (!covered || !datasetStatus?.initialised) return unverified(normalised, area);

      const reference = await findPostcode(prisma, normalised);

      // Covered area, no active row: this is the one place an authoritative INVALID comes from.
      if (!reference) {
        return {
          status: "INVALID",
          postcode: normalised,
          postcodeArea: area,
          areaCovered: true,
          location: EMPTY_LOCATION,
          reference: null,
        };
      }

      const { latitude, longitude } = eastingsNorthingsToWgs84(
        reference.eastings,
        reference.northings,
      );

      // Enrichment is best-effort on top of an already-settled verdict. Open Names having nothing
      // nearby changes neither validity nor coverage.
      const places = await findPlacesNear(
        prisma,
        reference.postcodeDistrict,
        reference.eastings,
        reference.northings,
      );
      const locality = resolveLocality(places, reference.eastings, reference.northings);

      return {
        status: "VALID",
        postcode: reference.displayPostcode,
        postcodeArea: area,
        areaCovered: true,
        location: {
          town: locality.town,
          district: locality.district,
          county: locality.county,
          latitude,
          longitude,
          streetSuggestions: rankNearbyStreets(places, reference.eastings, reference.northings),
        },
        reference,
      };
    } catch (error) {
      // The reference database is unreachable, the client could not be built, or a query failed.
      // None of that is evidence about the customer's postcode, so none of it may produce INVALID.
      console.error(
        `reference lookup unavailable for ${normalised}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return unverified(normalised, area);
    }
  },
);
