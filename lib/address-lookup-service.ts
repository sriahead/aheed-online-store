import { cache } from "react";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { eastingsNorthingsToWgs84 } from "@/lib/osgb36";
import { isValidPostcodeShape, normalisePostcode } from "@/lib/postcode-normalisation";
import { evaluateDeliveryEligibility, type DeliveryEligibility } from "@/lib/delivery-eligibility";
import { findPostcode } from "@/lib/repositories/postcodes";
import { findPlacesNear, rankNearbyStreets, resolveLocality } from "@/lib/repositories/places";
import { CODE_POINT_SOURCE_KEY, findDatasetStatus } from "@/lib/repositories/reference-data";
import { createAddressLookupProvider, type AddressCandidate } from "@/lib/address-lookup-provider";

/**
 * Address lookup orchestration (#764) — the request-scoped facade over the reference repositories.
 *
 * Lives beside `lib/repositories/`, not inside it, for the reason `lib/delivery-areas-service.ts`
 * already does: the repository modules' defining property is that every export takes `prisma`
 * explicitly and reads no request context, so a plain `tsx` script can import them in real Node.
 * This file is where the client and the vendor get resolved.
 *
 * ## The order of operations, and why it is this order
 *
 *   normalise -> validate against Code-Point -> resolve vendor -> delivery eligibility ->
 *   Open Names enrichment -> AddressLookupProvider -> assemble
 *
 * Validity comes first because everything after it is enrichment, and enriching a postcode that
 * does not exist is wasted work. Delivery eligibility comes before enrichment because it is the
 * answer most likely to change what the shopper does next. The provider comes last because it is
 * the part most likely to be replaced.
 *
 * **Runtime never calls the OS download services.** Everything here reads local tables. The only
 * code that talks to `api.os.uk` is `lib/reference-data/`, which runs on a Node runner on a
 * schedule and is unreachable from a request.
 *
 * Wrapped in React's `cache()` for the same reason `getFulfilmentMethod` is: a page, its form and
 * its summary can each ask about the same postcode within one render, and the answer cannot
 * legitimately differ between them. The Prisma client is constructed fresh on every call and never
 * cached across requests.
 */

/** What a caller gets back. Mirrors the public API shape minus nothing — see `toPublicJson`. */
export interface AddressLookupResult {
  postcode: string;
  eligibility: DeliveryEligibility;
  location: {
    town: string | null;
    district: string | null;
    county: string | null;
    latitude: number | null;
    longitude: number | null;
    streetSuggestions: string[];
  };
  addresses: AddressCandidate[];
  manualEntryAvailable: true;
}

/**
 * Look up a postcode for the current vendor.
 *
 * Returns `null` only when the input could not be a postcode at all, which the API turns into a
 * 400. Every other outcome — unknown postcode, undeliverable, no enrichment, no candidates — is a
 * successful result carrying a verdict, because each of those is something the shopper can act on.
 */
export const lookupAddress = cache(
  async (rawPostcode: string): Promise<AddressLookupResult | null> => {
    if (!isValidPostcodeShape(rawPostcode)) return null;

    const prisma = getPrisma();
    const normalised = normalisePostcode(rawPostcode);

    const [vendor, reference, datasetStatus] = await Promise.all([
      getCurrentVendorProfile(),
      findPostcode(prisma, normalised),
      findDatasetStatus(prisma, CODE_POINT_SOURCE_KEY),
    ]);

    const eligibility = evaluateDeliveryEligibility({
      postcode: normalised,
      deliveryPrefixes: vendor?.deliveryPrefixes ?? [],
      reference,
      referenceInitialised: datasetStatus?.initialised ?? false,
    });

    // Enrichment is only possible when Code-Point gave us a coordinate to search around. Its
    // absence changes nothing about the verdict above.
    let location: AddressLookupResult["location"] = {
      town: null,
      district: null,
      county: null,
      latitude: null,
      longitude: null,
      streetSuggestions: [],
    };

    if (reference) {
      const { latitude, longitude } = eastingsNorthingsToWgs84(
        reference.eastings,
        reference.northings,
      );
      const places = await findPlacesNear(
        prisma,
        reference.postcodeDistrict,
        reference.eastings,
        reference.northings,
      );
      const locality = resolveLocality(places, reference.eastings, reference.northings);

      location = {
        town: locality.town,
        district: locality.district,
        county: locality.county,
        latitude,
        longitude,
        streetSuggestions: rankNearbyStreets(places, reference.eastings, reference.northings),
      };
    }

    const addresses = await createAddressLookupProvider().lookup(normalised);

    return {
      postcode: eligibility.postcode,
      eligibility,
      location,
      addresses,
      manualEntryAvailable: true,
    };
  },
);

/**
 * The public JSON body.
 *
 * Deliberately built by naming each field rather than spreading the internal result: a field added
 * to `AddressLookupResult` later must be added here consciously, which is what stops an internal
 * identifier, a source version or a grid coordinate leaking into a public response by accident.
 *
 * `valid` is `true` only when Code-Point confirmed the postcode. An `UNVERIFIED` verdict therefore
 * reports `valid: false` — but the API never says the postcode is *invalid*, and the client is
 * required to treat a missing confirmation as "could not check", never as an error. That is why
 * `status` is carried explicitly rather than leaving the client to infer it from a boolean.
 */
export function toPublicJson(result: AddressLookupResult) {
  return {
    postcode: result.postcode,
    valid: result.eligibility.verified,
    status: result.eligibility.status,
    deliverable: result.eligibility.deliverable,
    location: {
      town: result.location.town,
      district: result.location.district,
      county: result.location.county,
      latitude: result.location.latitude,
      longitude: result.location.longitude,
      streetSuggestions: result.location.streetSuggestions,
    },
    addresses: result.addresses.map((candidate) => ({
      id: candidate.id,
      line1: candidate.line1,
      line2: candidate.line2,
      locality: candidate.locality,
      town: candidate.town,
      postcode: candidate.postcode,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      source: candidate.source,
    })),
    manualEntryAvailable: result.manualEntryAvailable,
  };
}
