import { describe, it, expect } from "vitest";
import {
  CHECKOUT_SECTION_TITLES,
  checkoutSections,
  type CheckoutSectionKey,
} from "@/lib/checkout-sections";

/**
 * #959 — every configuration the checkout form can render, with its exact section list. The
 * section number is the 1-based position, so an exact list per case is also the proof that numbers
 * run 1..n with no repeat or gap. Table: specs/2026-10-03-p958-959-mobile-checkout/plan.md §2.
 */
type Case = {
  offerCollection: boolean;
  method: "DELIVERY" | "COLLECTION";
  offerDeliverySlots: boolean;
  hasRedeemable: boolean;
  expected: CheckoutSectionKey[];
};

// prettier-ignore
const ALL_CASES: Case[] = [
  // offerCollection, method, offerDeliverySlots, hasRedeemable
  { offerCollection: true, method: "DELIVERY", offerDeliverySlots: true, hasRedeemable: false, expected: ["fulfilment", "contact", "address", "time", "discount"] },
  { offerCollection: true, method: "DELIVERY", offerDeliverySlots: true, hasRedeemable: true, expected: ["fulfilment", "contact", "address", "time", "loyalty", "discount"] },
  { offerCollection: true, method: "DELIVERY", offerDeliverySlots: false, hasRedeemable: false, expected: ["fulfilment", "contact", "address", "discount"] },
  { offerCollection: true, method: "DELIVERY", offerDeliverySlots: false, hasRedeemable: true, expected: ["fulfilment", "contact", "address", "loyalty", "discount"] },
  { offerCollection: true, method: "COLLECTION", offerDeliverySlots: true, hasRedeemable: false, expected: ["fulfilment", "contact", "time", "discount"] },
  { offerCollection: true, method: "COLLECTION", offerDeliverySlots: true, hasRedeemable: true, expected: ["fulfilment", "contact", "time", "loyalty", "discount"] },
  { offerCollection: true, method: "COLLECTION", offerDeliverySlots: false, hasRedeemable: false, expected: ["fulfilment", "contact", "time", "discount"] },
  { offerCollection: true, method: "COLLECTION", offerDeliverySlots: false, hasRedeemable: true, expected: ["fulfilment", "contact", "time", "loyalty", "discount"] },
  { offerCollection: false, method: "DELIVERY", offerDeliverySlots: true, hasRedeemable: false, expected: ["contact", "address", "time", "discount"] },
  { offerCollection: false, method: "DELIVERY", offerDeliverySlots: true, hasRedeemable: true, expected: ["contact", "address", "time", "loyalty", "discount"] },
  { offerCollection: false, method: "DELIVERY", offerDeliverySlots: false, hasRedeemable: false, expected: ["contact", "address", "discount"] },
  { offerCollection: false, method: "DELIVERY", offerDeliverySlots: false, hasRedeemable: true, expected: ["contact", "address", "loyalty", "discount"] },
  { offerCollection: false, method: "COLLECTION", offerDeliverySlots: true, hasRedeemable: false, expected: ["contact", "time", "discount"] },
  { offerCollection: false, method: "COLLECTION", offerDeliverySlots: true, hasRedeemable: true, expected: ["contact", "time", "loyalty", "discount"] },
  { offerCollection: false, method: "COLLECTION", offerDeliverySlots: false, hasRedeemable: false, expected: ["contact", "time", "discount"] },
  { offerCollection: false, method: "COLLECTION", offerDeliverySlots: false, hasRedeemable: true, expected: ["contact", "time", "loyalty", "discount"] },
];

describe("checkoutSections", () => {
  it("covers all 16 combinations exactly once", () => {
    const keys = new Set(
      ALL_CASES.map(
        (c) => `${c.offerCollection}|${c.method}|${c.offerDeliverySlots}|${c.hasRedeemable}`,
      ),
    );
    expect(keys.size).toBe(16);
  });

  it.each(ALL_CASES)(
    "collection=$offerCollection method=$method slots=$offerDeliverySlots loyalty=$hasRedeemable",
    ({ expected, ...input }) => {
      const sections = checkoutSections(input);
      expect(sections).toEqual(expected);
      expect(new Set(sections).size).toBe(sections.length);
    },
  );

  // The four configurations named in #959 and in requirements.md R12.
  it("collection offered, delivery, slots on, no loyalty", () => {
    expect(
      checkoutSections({
        offerCollection: true,
        method: "DELIVERY",
        offerDeliverySlots: true,
        hasRedeemable: false,
      }),
    ).toEqual(["fulfilment", "contact", "address", "time", "discount"]);
  });

  it("collection offered, delivery, slots on, with loyalty", () => {
    expect(
      checkoutSections({
        offerCollection: true,
        method: "DELIVERY",
        offerDeliverySlots: true,
        hasRedeemable: true,
      }),
    ).toEqual(["fulfilment", "contact", "address", "time", "loyalty", "discount"]);
  });

  it("collection offered, Click & Collect, no loyalty", () => {
    expect(
      checkoutSections({
        offerCollection: true,
        method: "COLLECTION",
        offerDeliverySlots: true,
        hasRedeemable: false,
      }),
    ).toEqual(["fulfilment", "contact", "time", "discount"]);
  });

  it("collection not offered, delivery, slots off, no loyalty", () => {
    expect(
      checkoutSections({
        offerCollection: false,
        method: "DELIVERY",
        offerDeliverySlots: false,
        hasRedeemable: false,
      }),
    ).toEqual(["contact", "address", "discount"]);
  });
});

describe("CHECKOUT_SECTION_TITLES", () => {
  it("carries the heading titles from plan.md §2", () => {
    expect(CHECKOUT_SECTION_TITLES).toEqual({
      fulfilment: "Fulfilment Method",
      contact: "Contact information",
      address: "Delivery address & instructions",
      time: "Choose a Time",
      loyalty: "Loyalty points",
      discount: "Discount code",
    });
  });
});
