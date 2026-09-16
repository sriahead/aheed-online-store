import { isDeliverable } from "@/lib/delivery";
import { formatPostcode } from "@/lib/postcode-normalisation";
import type { PostcodeStatus } from "@/lib/reference/postcode-reference-service";

/**
 * Delivery eligibility (#764) — pure, DB-free, and the ONLY place that calls `isDeliverable`.
 *
 * Before this existed, three call sites each asked the question their own way:
 * `components/layout/Header.tsx`, `features/checkout/place-order.ts` and
 * `lib/fulfilment-service.ts`. Three implementations of one rule is three chances for the header to
 * promise something checkout then refuses.
 *
 * ## Two questions, two owners, deliberately never merged
 *
 * **Does this postcode exist?** Owned by the reference-data service, from OS Code-Point Open within
 * a materialised postcode area. Arrives here as a `PostcodeStatus` and is never re-derived.
 *
 * **Does this vendor deliver there?** Owned by Aheed, from that vendor's own `VendorDeliveryArea`
 * prefixes through `lib/delivery.ts`. Needs no reference data at all, which is why an environment
 * with no reference database still refuses an out-of-area postcode correctly.
 *
 * Keeping them apart is what lets the reference database be shared platform infrastructure: a
 * tenant's commercial rules never reach it, and its availability never decides a tenant's rules.
 *
 * ## The state model
 *
 * | Postcode status | Verdict |
 * |---|---|
 * | `INVALID` (covered area, authoritative absence, or malformed) | `INVALID_POSTCODE` |
 * | `UNVERIFIED` (area not materialised, or reference unavailable) | `UNVERIFIED` |
 * | `VALID`, outside this vendor's areas | `OUTSIDE_DELIVERY_AREA` |
 * | `VALID`, inside this vendor's areas | `DELIVERABLE` |
 *
 * `UNVERIFIED` must never be presented to a shopper as an invalid postcode, and must never block
 * manual address entry or order placement. A coverage gap or an unreachable reference database
 * should degrade to "we could not check" — never to "your address is wrong", which would turn an
 * infrastructure problem into lost orders.
 *
 * Note what that means concretely: a customer in Edinburgh, whose area this environment has never
 * imported, can still complete checkout. They are refused only if their vendor does not deliver
 * there — a decision made entirely from Aheed's own configuration.
 */

export type DeliveryEligibilityStatus =
  "INVALID_POSTCODE" | "UNVERIFIED" | "OUTSIDE_DELIVERY_AREA" | "DELIVERABLE";

export interface DeliveryEligibility {
  status: DeliveryEligibilityStatus;
  /** Canonical spaced form of what was asked about, for display. */
  postcode: string;
  /**
   * Whether this vendor's configured areas cover the postcode.
   *
   * Populated in every state except `INVALID_POSTCODE`, including `UNVERIFIED` — vendor delivery
   * configuration is authoritative on its own and needs no reference data to be applied.
   */
  deliverable: boolean;
  /** True only when the reference service confirmed the postcode exists. */
  verified: boolean;
  /**
   * Whether the postcode's area is materialised in the reference database.
   *
   * Distinguishes the two reasons a verdict can be `UNVERIFIED` — an area we have not imported
   * versus a reference database we could not reach — which matters for diagnosis but never for
   * what the shopper is shown.
   */
  areaCovered: boolean;
}

export interface EligibilityInput {
  postcode: string;
  /** The current vendor's `VendorDeliveryArea` prefixes. */
  deliveryPrefixes: string[];
  /** The reference service's verdict on whether this postcode exists. */
  referenceStatus: PostcodeStatus;
  /** Whether the postcode's area is materialised. */
  areaCovered: boolean;
}

export function evaluateDeliveryEligibility(input: EligibilityInput): DeliveryEligibility {
  const postcode = formatPostcode(input.postcode);

  if (input.referenceStatus === "INVALID") {
    return {
      status: "INVALID_POSTCODE",
      postcode,
      deliverable: false,
      verified: false,
      areaCovered: input.areaCovered,
    };
  }

  const deliverable = isDeliverable(input.postcode, input.deliveryPrefixes);

  if (input.referenceStatus === "UNVERIFIED") {
    return {
      status: "UNVERIFIED",
      postcode,
      deliverable,
      verified: false,
      areaCovered: input.areaCovered,
    };
  }

  return {
    status: deliverable ? "DELIVERABLE" : "OUTSIDE_DELIVERY_AREA",
    postcode,
    deliverable,
    verified: true,
    areaCovered: input.areaCovered,
  };
}

/**
 * Whether a verdict should stop an order being placed.
 *
 * Only two things do: a postcode that is definitely not real, and one this vendor definitely does
 * not serve. `UNVERIFIED` never blocks — that is the entire reason the state exists.
 */
export function blocksCheckout(eligibility: DeliveryEligibility): boolean {
  return (
    eligibility.status === "INVALID_POSTCODE" || eligibility.status === "OUTSIDE_DELIVERY_AREA"
  );
}

/**
 * The message a shopper should see, or null when there is nothing to say.
 *
 * `UNVERIFIED` returns null deliberately: there is nothing useful to tell a shopper about our own
 * coverage or connectivity, and any message here would read as doubt about their address.
 */
export function eligibilityMessage(eligibility: DeliveryEligibility): string | null {
  switch (eligibility.status) {
    case "INVALID_POSTCODE":
      return "That postcode doesn't look right. Please check it, or enter your address manually.";
    case "OUTSIDE_DELIVERY_AREA":
      return `Sorry — we don't deliver to ${eligibility.postcode} yet.`;
    case "UNVERIFIED":
    case "DELIVERABLE":
      return null;
  }
}
