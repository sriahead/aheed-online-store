import { cache } from "react";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { isValidPostcodeShape, normalisePostcode } from "@/lib/postcode-normalisation";
import { evaluateDeliveryEligibility, type DeliveryEligibility } from "@/lib/delivery-eligibility";
import {
  lookupPostcodeReference,
  type ReferenceLocation,
} from "@/lib/reference/postcode-reference-service";
import { createAddressLookupProvider, type AddressCandidate } from "@/lib/address-lookup-provider";

/**
 * Address lookup orchestration (#764).
 *
 * ## The order of operations, and why it is this order
 *
 *   normalise -> reference lookup (validity + enrichment) -> resolve vendor ->
 *   delivery eligibility -> AddressLookupProvider -> assemble
 *
 * The reference lookup comes first because everything after it is either derived from it or
 * independent of it. Delivery eligibility follows because it is the answer most likely to change
 * what the shopper does next. The provider comes last because it is the part most likely to be
 * replaced.
 *
 * **Runtime never calls the OS download services.** Everything here reads the reference database
 * through `lib/reference/`. The only code that talks to `api.os.uk` is `lib/reference-data/`, which
 * runs on a Node runner on a schedule and is unreachable from a request.
 *
 * Wrapped in React's `cache()`, and so are both services beneath it, so a page, its form and its
 * summary asking about the same postcode within one render share a single reference round trip.
 */

export interface AddressLookupResult {
  postcode: string;
  eligibility: DeliveryEligibility;
  location: ReferenceLocation;
  addresses: AddressCandidate[];
  manualEntryAvailable: true;
}

/**
 * Look up a postcode for the current vendor.
 *
 * Returns `null` only when the input could not be a postcode at all, which the API turns into a
 * 400. Every other outcome — unknown postcode, uncovered area, unreachable reference database,
 * undeliverable, no enrichment, no candidates — is a successful result carrying a verdict, because
 * each of those is something the shopper can act on.
 */
export const lookupAddress = cache(
  async (rawPostcode: string): Promise<AddressLookupResult | null> => {
    if (!isValidPostcodeShape(rawPostcode)) return null;

    const normalised = normalisePostcode(rawPostcode);

    const [reference, vendor] = await Promise.all([
      lookupPostcodeReference(normalised),
      getCurrentVendorProfile(),
    ]);

    const eligibility = evaluateDeliveryEligibility({
      postcode: normalised,
      deliveryPrefixes: vendor?.deliveryPrefixes ?? [],
      referenceStatus: reference.status,
      areaCovered: reference.areaCovered,
    });

    const addresses = await createAddressLookupProvider().lookup(normalised);

    return {
      postcode: reference.postcode || eligibility.postcode,
      eligibility,
      location: reference.location,
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
 * Note what is NOT forwarded — `reference`, the raw Code-Point row with its eastings/northings and
 * administrative codes, stays inside the service.
 *
 * `valid` is `true` only when the reference service confirmed the postcode. An `UNVERIFIED` verdict
 * therefore reports `valid: false` — but the API never claims the postcode is *invalid*, which is
 * why `status` is carried explicitly rather than left for a client to infer from a boolean. A
 * client must treat `UNVERIFIED` as "could not check", never as an error.
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
