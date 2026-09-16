import { describe, expect, it } from "vitest";
import {
  createAddressLookupProvider,
  unavailableAddressProvider,
  type AddressCandidate,
} from "@/lib/address-lookup-provider";

/**
 * The address-candidate provider port (#764).
 *
 * The port ships with no real implementation because no source this application may lawfully use
 * offers property-level UK addresses today — OS Places is commercial and excluded from the free
 * credit, EPC's address fields carry AddressBase/PAF licensing restrictions, and OpenStreetMap was
 * measured at roughly 18% coverage in Milton Keynes.
 *
 * So these tests pin two things: that an empty result is a NORMAL outcome rather than an error, and
 * that the candidate shape stays provider-neutral. The second is what makes swapping in a licensed
 * provider a configuration change rather than a checkout rewrite.
 */

describe("unavailableAddressProvider", () => {
  it("resolves to an empty array rather than throwing", async () => {
    // "No candidates" is the state the whole flow is designed around: the shopper completes their
    // address manually and still gets a validated postcode, a delivery verdict and street hints.
    await expect(unavailableAddressProvider.lookup("MK9 2NW")).resolves.toEqual([]);
  });

  it("returns empty for any input, including nonsense", async () => {
    await expect(unavailableAddressProvider.lookup("")).resolves.toEqual([]);
    await expect(unavailableAddressProvider.lookup("ZZ99 9ZZ")).resolves.toEqual([]);
  });

  it("identifies itself, so a candidate's source is never ambiguous", () => {
    expect(unavailableAddressProvider.key).toBe("unavailable");
  });
});

describe("createAddressLookupProvider", () => {
  it("returns the unavailable provider while no licensed source is configured", () => {
    expect(createAddressLookupProvider()).toBe(unavailableAddressProvider);
  });

  it("is the single seam a future licensed provider plugs into", async () => {
    // Nothing else in the application resolves a provider, so introducing one is one edit here
    // rather than a search for every place that assumed there were no candidates.
    const provider = createAddressLookupProvider();

    expect(typeof provider.lookup).toBe("function");
    expect(typeof provider.key).toBe("string");
    await expect(provider.lookup("MK9 2NW")).resolves.toBeInstanceOf(Array);
  });
});

describe("AddressCandidate shape", () => {
  it("carries only provider-neutral fields", () => {
    // A provider's native schema — UPRNs, certificate identifiers, match scores — stops at this
    // boundary. If the application learned to depend on one source's shape, swapping the source
    // would stop being a configuration change.
    const candidate: AddressCandidate = {
      id: "opaque-provider-id",
      line1: "1 Silbury Boulevard",
      line2: null,
      locality: null,
      town: "Milton Keynes",
      postcode: "MK9 2NW",
      latitude: 52.040001,
      longitude: -0.759,
      source: "some-future-provider",
    };

    expect(Object.keys(candidate).sort()).toEqual([
      "id",
      "latitude",
      "line1",
      "line2",
      "locality",
      "longitude",
      "postcode",
      "source",
      "town",
    ]);
  });
});
