import { describe, expect, it } from "vitest";
import {
  blocksCheckout,
  eligibilityMessage,
  evaluateDeliveryEligibility,
  type EligibilityInput,
} from "@/lib/delivery-eligibility";
import type { PostcodeReferenceRow } from "@/lib/repositories/postcodes";

/**
 * The delivery-eligibility state model (#764).
 *
 * The distinction these tests exist to pin down is INVALID_POSTCODE versus UNVERIFIED. Conflating
 * them turns a deployment-ordering accident — reference data not yet imported in an environment —
 * into rejected checkouts, which is the expensive direction to be wrong in.
 */

const MK9: PostcodeReferenceRow = {
  normalisedPostcode: "MK92NW",
  displayPostcode: "MK9 2NW",
  postcodeArea: "MK",
  postcodeDistrict: "MK9",
  eastings: 484857,
  northings: 238851,
  adminDistrictCode: "E06000042",
  adminCountyCode: null,
  countryCode: "E92000001",
};

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    postcode: "MK9 2NW",
    deliveryPrefixes: ["MK"],
    reference: MK9,
    referenceInitialised: true,
    ...overrides,
  };
}

describe("evaluateDeliveryEligibility", () => {
  it("is DELIVERABLE when the postcode exists and the vendor covers it", () => {
    const result = evaluateDeliveryEligibility(input());

    expect(result.status).toBe("DELIVERABLE");
    expect(result.deliverable).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.postcode).toBe("MK9 2NW");
  });

  it("is OUTSIDE_DELIVERY_AREA when the postcode exists but the vendor does not cover it", () => {
    const result = evaluateDeliveryEligibility(input({ deliveryPrefixes: ["RG"] }));

    expect(result.status).toBe("OUTSIDE_DELIVERY_AREA");
    expect(result.deliverable).toBe(false);
    // Still verified: the postcode is real, it is simply not served.
    expect(result.verified).toBe(true);
  });

  it("is INVALID_POSTCODE when reference data IS loaded and no row matches", () => {
    const result = evaluateDeliveryEligibility(input({ postcode: "ZZ99 9ZZ", reference: null }));

    expect(result.status).toBe("INVALID_POSTCODE");
    expect(result.verified).toBe(false);
  });

  it("is INVALID_POSTCODE for something that is not shaped like a postcode at all", () => {
    // Shape is judged locally and does not depend on any dataset.
    const result = evaluateDeliveryEligibility(input({ postcode: "NOT A POSTCODE" }));

    expect(result.status).toBe("INVALID_POSTCODE");
  });

  describe("when reference data has never been initialised here", () => {
    it("is UNVERIFIED even for a postcode no row matches", () => {
      const result = evaluateDeliveryEligibility(
        input({ postcode: "ZZ99 9ZZ", reference: null, referenceInitialised: false }),
      );

      expect(result.status).toBe("UNVERIFIED");
      expect(result.verified).toBe(false);
    });

    it("is UNVERIFIED even when a row DOES happen to exist", () => {
      // The test is the dataset's sync history, not whether a row is present. A half-populated
      // table from an interrupted first run is not an authority, and must not be treated as one.
      const result = evaluateDeliveryEligibility(input({ referenceInitialised: false }));

      expect(result.status).toBe("UNVERIFIED");
    });

    it("still applies the vendor's delivery areas, because those need no reference data", () => {
      const covered = evaluateDeliveryEligibility(
        input({ referenceInitialised: false, deliveryPrefixes: ["MK"] }),
      );
      const notCovered = evaluateDeliveryEligibility(
        input({ referenceInitialised: false, deliveryPrefixes: ["RG"] }),
      );

      expect(covered.deliverable).toBe(true);
      expect(notCovered.deliverable).toBe(false);
    });
  });

  it("distinguishes MK9 from MK17 when the vendor lists districts rather than the whole area", () => {
    // #613's granularity, already supported by lib/delivery.ts and exercised through the one
    // service every caller now uses.
    const mk9 = evaluateDeliveryEligibility(input({ deliveryPrefixes: ["MK9"] }));
    const mk17 = evaluateDeliveryEligibility(
      input({ postcode: "MK17 8NL", deliveryPrefixes: ["MK9"], reference: { ...MK9, postcodeDistrict: "MK17" } }), // prettier-ignore
    );

    expect(mk9.status).toBe("DELIVERABLE");
    expect(mk17.status).toBe("OUTSIDE_DELIVERY_AREA");
  });

  it("normalises the postcode it echoes back, whatever the caller typed", () => {
    expect(evaluateDeliveryEligibility(input({ postcode: "mk9  2nw" })).postcode).toBe("MK9 2NW");
  });

  it("treats an empty prefix list as delivering nowhere, not everywhere", () => {
    const result = evaluateDeliveryEligibility(input({ deliveryPrefixes: [] }));
    expect(result.deliverable).toBe(false);
  });
});

describe("blocksCheckout", () => {
  it.each([
    ["INVALID_POSTCODE", { postcode: "ZZ99 9ZZ", reference: null }, true],
    ["OUTSIDE_DELIVERY_AREA", { deliveryPrefixes: ["RG"] }, true],
    ["DELIVERABLE", {}, false],
  ] as const)("returns %s -> %s", (_label, overrides, expected) => {
    expect(blocksCheckout(evaluateDeliveryEligibility(input(overrides)))).toBe(expected);
  });

  it("NEVER blocks on UNVERIFIED — the entire reason that state exists", () => {
    const unverified = evaluateDeliveryEligibility(input({ referenceInitialised: false }));
    expect(unverified.status).toBe("UNVERIFIED");
    expect(blocksCheckout(unverified)).toBe(false);
  });

  it("does not block an UNVERIFIED postcode even when no row exists for it", () => {
    const unverified = evaluateDeliveryEligibility(
      input({ postcode: "ZZ99 9ZZ", reference: null, referenceInitialised: false }),
    );
    expect(blocksCheckout(unverified)).toBe(false);
  });
});

describe("eligibilityMessage", () => {
  it("says nothing at all for UNVERIFIED", () => {
    // Any message here would read to a shopper as doubt about their address, when the gap is ours.
    const unverified = evaluateDeliveryEligibility(input({ referenceInitialised: false }));
    expect(eligibilityMessage(unverified)).toBeNull();
  });

  it("says nothing for DELIVERABLE", () => {
    expect(eligibilityMessage(evaluateDeliveryEligibility(input()))).toBeNull();
  });

  it("names the postcode when the vendor does not serve it", () => {
    const message = eligibilityMessage(
      evaluateDeliveryEligibility(input({ deliveryPrefixes: ["RG"] })),
    );
    expect(message).toContain("MK9 2NW");
  });

  it("asks the shopper to check, and points at manual entry, for a bad postcode", () => {
    const message = eligibilityMessage(
      evaluateDeliveryEligibility(input({ postcode: "ZZ99 9ZZ", reference: null })),
    );
    expect(message).toMatch(/manually/i);
  });
});
