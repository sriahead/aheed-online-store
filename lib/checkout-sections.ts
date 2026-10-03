import type { FulfilmentMethodChoice } from "@/lib/fulfilment-cookie";

/**
 * Which checkout sections render, in order (#959). Pure and DB-free, like
 * `lib/product-grid-density.ts`, so every configuration is unit-tested in
 * `tests/checkout-sections.test.ts`.
 *
 * A section's number is its 1-based position in this list. The numbers used to be hardcoded
 * ternaries in `CheckoutForm`, several with identical branches, so most configurations showed a
 * repeat or a gap (1, 2, 3, 3 or 1, 3, 3). On a phone those numbers are the only progress cue.
 *
 * The conditions mirror the ones `CheckoutForm` renders each section under. Change both together.
 */

export type CheckoutSectionKey =
  "fulfilment" | "contact" | "address" | "time" | "loyalty" | "discount";

export const CHECKOUT_SECTION_TITLES: Readonly<Record<CheckoutSectionKey, string>> = {
  fulfilment: "Fulfilment Method",
  contact: "Contact information",
  address: "Delivery address & instructions",
  time: "Choose a Time",
  loyalty: "Loyalty points",
  discount: "Discount code",
};

export interface CheckoutSectionsInput {
  offerCollection: boolean;
  method: FulfilmentMethodChoice;
  offerDeliverySlots: boolean;
  hasRedeemable: boolean;
}

export function checkoutSections({
  offerCollection,
  method,
  offerDeliverySlots,
  hasRedeemable,
}: CheckoutSectionsInput): CheckoutSectionKey[] {
  const sections: CheckoutSectionKey[] = [];
  if (offerCollection) sections.push("fulfilment");
  sections.push("contact");
  if (method === "DELIVERY") sections.push("address");
  if ((method === "DELIVERY" && offerDeliverySlots) || method === "COLLECTION") {
    sections.push("time");
  }
  if (hasRedeemable) sections.push("loyalty");
  sections.push("discount");
  return sections;
}
