import { isDeliverable } from "@/lib/delivery";
import { formatPostcode, isValidPostcodeShape } from "@/lib/postcode-normalisation";
import type { PostcodeReferenceRow } from "@/lib/repositories/postcodes";

/**
 * Delivery eligibility (#764) — pure, DB-free, and the ONLY place that calls `isDeliverable`.
 *
 * Before this existed, three call sites each asked the question their own way:
 * `components/layout/Header.tsx`, `features/checkout/place-order.ts` and
 * `lib/fulfilment-service.ts`. Three implementations of one rule is three chances for the header
 * to promise something checkout then refuses.
 *
 * ## The two things this deliberately keeps separate
 *
 * **Does this postcode exist?** Answered solely by OS Code-Point Open, through an active
 * `PostcodeReference` row. Not by Open Names, not by a third-party API, not by a regular
 * expression.
 *
 * **Does this vendor deliver there?** Answered solely by that vendor's own `VendorDeliveryArea`
 * prefixes, through `lib/delivery.ts`. Unchanged by this slice, and independent of reference data —
 * which is why an environment with no reference data still refuses an out-of-area postcode
 * correctly.
 *
 * ## The state model, and why UNVERIFIED exists
 *
 * | Condition | Verdict |
 * |---|---|
 * | Not shaped like a UK postcode | `INVALID_POSTCODE` |
 * | Reference data never initialised here | `UNVERIFIED` |
 * | Initialised, no active row matches | `INVALID_POSTCODE` |
 * | Initialised, matches, outside this vendor's areas | `OUTSIDE_DELIVERY_AREA` |
 * | Initialised, matches, inside this vendor's areas | `DELIVERABLE` |
 *
 * The test for "initialised" is the **dataset's own sync history**, not whether some row happens to
 * be present. A table nobody has ever successfully filled is not evidence that a postcode does not
 * exist, and a half-populated table from an interrupted first run is not an authority. So an
 * environment reaching this code before its first sync answers `UNVERIFIED` for **every** postcode,
 * including ones a partial table might coincidentally contain.
 *
 * `UNVERIFIED` must never be presented to a shopper as an invalid postcode, and must never block
 * manual address entry or order placement. A deployment-ordering accident should degrade to "we
 * could not check" — never to "your address is wrong", which would turn an operational gap into
 * lost orders.
 *
 * Shape is judged locally in every state, because whether a string *could* be a postcode does not
 * depend on any dataset. It is also the only verdict that can be reached without a database at all.
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
  /** True when Code-Point confirmed the postcode exists. False in every other state. */
  verified: boolean;
}

export interface EligibilityInput {
  postcode: string;
  /** The current vendor's `VendorDeliveryArea` prefixes. */
  deliveryPrefixes: string[];
  /** The matching Code-Point row, or null when none is active. */
  reference: PostcodeReferenceRow | null;
  /** Whether the `code-point-open` dataset has ever completed a successful sync here. */
  referenceInitialised: boolean;
}

export function evaluateDeliveryEligibility(input: EligibilityInput): DeliveryEligibility {
  const postcode = formatPostcode(input.postcode);

  if (!isValidPostcodeShape(input.postcode)) {
    return { status: "INVALID_POSTCODE", postcode, deliverable: false, verified: false };
  }

  const deliverable = isDeliverable(input.postcode, input.deliveryPrefixes);

  if (!input.referenceInitialised) {
    return { status: "UNVERIFIED", postcode, deliverable, verified: false };
  }

  if (!input.reference) {
    return { status: "INVALID_POSTCODE", postcode, deliverable: false, verified: false };
  }

  return {
    status: deliverable ? "DELIVERABLE" : "OUTSIDE_DELIVERY_AREA",
    postcode,
    deliverable,
    verified: true,
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
 * `UNVERIFIED` returns null deliberately: there is no useful thing to tell a shopper about our own
 * reference data not being loaded, and any message here would read as doubt about their address.
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
