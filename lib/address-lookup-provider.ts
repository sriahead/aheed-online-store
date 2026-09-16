/**
 * The address-candidate provider port (#764).
 *
 * ## Why this exists with no real implementation behind it
 *
 * There is currently **no source this application may lawfully use** to offer property-level UK
 * address candidates, so `addresses` in the public API is empty today. The port exists anyway, and
 * that is the deliberate design rather than a placeholder:
 *
 * - **OS Places API** (AddressBase Premium) is commercial, and is explicitly excluded from OS Data
 *   Hub's otherwise generous free monthly credit.
 * - **EPC open data** was investigated and **rejected**. Much of the dataset is OGL, but its
 *   address and postcode fields carry additional licensing restrictions because they incorporate
 *   AddressBase Premium / Royal Mail PAF-derived data, and address-level EPC records raise
 *   data-protection questions of their own. It is not imported, not exposed, and not a dependency.
 * - **OpenStreetMap** was measured rather than assumed: a central Milton Keynes bounding box
 *   contains 2,937 mapped buildings but only 518 objects carrying `addr:housenumber`, a ceiling
 *   around 18% — and lower in practice, since one building is not one addressable flat. Its ODbL
 *   share-alike terms are a separate problem again.
 *
 * So the honest contract is: this interface is the single seam where a licensed provider
 * (PAF-derived, commercial, or a future EPC arrangement) plugs in. When one does,
 * `createAddressLookupProvider` returns it instead, `addresses` starts being populated, and
 * **nothing else changes** — not checkout, not the forms, not the API response shape, not postcode
 * validation, not delivery eligibility. That is the property the port is bought for.
 *
 * ## What a candidate may expose
 *
 * `AddressCandidate` is deliberately narrow and provider-neutral. A provider's native schema —
 * UPRNs, certificate identifiers, match scores, internal ids — stops here and never reaches the
 * public API. The application must not learn to depend on any one source's shape, or swapping the
 * source stops being a configuration change.
 */

/** A normalised, provider-neutral property address. */
export interface AddressCandidate {
  /** Stable identifier from the provider, opaque to the application. */
  id: string;
  line1: string;
  line2: string | null;
  locality: string | null;
  town: string | null;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  /** Which provider produced this, for support and auditing. Never a schema detail. */
  source: string;
}

export interface AddressLookupProvider {
  /** Stable identifier for the provider, used in logs and in a candidate's `source`. */
  readonly key: string;
  /**
   * Candidates for a postcode, or an empty array when the provider has none.
   *
   * An empty result is an ordinary outcome and must never be read as "this postcode is invalid" —
   * that question belongs to Code-Point alone.
   */
  lookup(postcode: string): Promise<AddressCandidate[]>;
}

/**
 * The provider used when no licensed address source is configured — which is every deployment
 * today.
 *
 * It returns an empty array rather than throwing, because "no candidates available" is a normal
 * state the whole flow is designed around: the shopper completes their address manually, exactly as
 * they do now, and the lookup still gives them a validated postcode, a delivery verdict, a town and
 * county, and street suggestions.
 */
export const unavailableAddressProvider: AddressLookupProvider = {
  key: "unavailable",
  async lookup(): Promise<AddressCandidate[]> {
    return [];
  },
};

/**
 * Resolve the configured provider.
 *
 * A single function so that introducing a licensed provider later is one edit here, rather than a
 * search for every place that assumed there were no candidates.
 */
export function createAddressLookupProvider(): AddressLookupProvider {
  return unavailableAddressProvider;
}
