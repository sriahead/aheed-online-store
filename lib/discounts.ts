/**
 * Pure discount-code rules (P5b, #145) — no I/O, so they're unit-testable
 * without a database (same split as lib/loyalty.ts, lib/order-totals.ts,
 * lib/cart-rules.ts, lib/order-status.ts and lib/shopping-list.ts).
 *
 * Money is integer pence and a PERCENTAGE code's value is BASIS POINTS
 * (1000 = 10%), matching VendorLoyaltyTier.multiplierBps. No floating-point
 * arithmetic decides what anyone pays.
 */

import { MIN_PAYABLE_PENCE } from "@/lib/loyalty";

export type DiscountKind = "PERCENTAGE" | "FIXED_AMOUNT";

/**
 * Why a code did not apply. Every one of these becomes a message the shopper
 * reads at checkout, which is why they are distinct: "that code has expired" and
 * "you've already used that code" are different problems with different fixes.
 *
 * `UNKNOWN` is deliberately NOT producible by `evaluateCode` — only the
 * repository lookup can know that a code does not exist. It lives in this union
 * so the checkout has one exhaustive set of reasons to render.
 */
export type CodeRefusalReason =
  | "UNKNOWN"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "BELOW_MINIMUM"
  | "USAGE_LIMIT_REACHED"
  | "CUSTOMER_LIMIT_REACHED"
  | "SIGN_IN_REQUIRED"
  | "NO_HEADROOM";

export type CodeEvaluation =
  { ok: true; discountPence: number } | { ok: false; reason: CodeRefusalReason };

/**
 * The single normalisation applied to every code, on both sides of the compare:
 * what an admin creates and what a shopper types. `@@unique([vendorId, code])`
 * is only a real uniqueness guarantee if both paths normalise identically, so
 * this function is the definition of "the same code" — not a convenience.
 */
export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export interface CodeValueInput {
  kind: DiscountKind;
  /** Basis points for PERCENTAGE, pence for FIXED_AMOUNT. */
  value: number;
  subtotalPence: number;
}

/**
 * The code's face value against a subtotal, BEFORE any clamping.
 *
 * Floors rather than rounds: a rounded percentage can hand out a penny the
 * arithmetic didn't earn, and every other money rule in this codebase floors.
 */
export function computeCodeDiscountPence({ kind, value, subtotalPence }: CodeValueInput): number {
  if (kind === "PERCENTAGE") {
    return Math.floor((Math.max(0, subtotalPence) * Math.max(0, value)) / 10000);
  }
  return Math.max(0, value);
}

export interface EvaluateCodeInput {
  // ---- the code's own terms
  kind: DiscountKind;
  value: number;
  minSubtotalPence: number;
  startsAt: Date;
  /** null = no end date. */
  endsAt: Date | null;
  /** Counts DOWN. null = unlimited. */
  remainingRedemptions: number | null;
  /** null = no per-customer cap, which is also what makes a code guest-usable. */
  maxPerCustomer: number | null;
  isActive: boolean;

  // ---- this particular checkout
  subtotalPence: number;
  deliveryFeePence: number;
  /** null for a guest checkout. */
  userId: string | null;
  /** How many times THIS shopper has already used THIS code. */
  customerUseCount: number;
  now: Date;
}

function refuse(reason: CodeRefusalReason): CodeEvaluation {
  return { ok: false, reason };
}

/**
 * Whether a code applies to this checkout, and for how much.
 *
 * Refusal precedence is fixed and ordered from "nothing you can do about it" to
 * "you could fix this": a deactivated code is reported as deactivated even if
 * the basket is also too small, because telling the shopper to spend more on a
 * code that will never work again is worse than saying nothing.
 *
 * `minSubtotalPence` is judged on the PRE-DISCOUNT subtotal, matching how the
 * vendor's `minimumOrderPence` and the free-delivery threshold are already
 * judged in `placeOrder`. One rule for "what the shopper bought", applied
 * everywhere — so spending loyalty points cannot disqualify a code, for the same
 * reason it cannot claw back free delivery.
 */
export function evaluateCode(input: EvaluateCodeInput): CodeEvaluation {
  if (!input.isActive) return refuse("INACTIVE");
  if (input.now.getTime() < input.startsAt.getTime()) return refuse("NOT_STARTED");
  if (input.endsAt !== null && input.now.getTime() > input.endsAt.getTime()) {
    return refuse("EXPIRED");
  }
  if (input.remainingRedemptions !== null && input.remainingRedemptions <= 0) {
    return refuse("USAGE_LIMIT_REACHED");
  }
  // A per-customer cap is uncountable without an identity, so it implies sign-in.
  // A guest's cart is identified by P3a's guestToken, which is a cart, not a person.
  if (input.maxPerCustomer !== null && input.userId === null) {
    return refuse("SIGN_IN_REQUIRED");
  }
  if (input.maxPerCustomer !== null && input.customerUseCount >= input.maxPerCustomer) {
    return refuse("CUSTOMER_LIMIT_REACHED");
  }
  if (input.subtotalPence < input.minSubtotalPence) return refuse("BELOW_MINIMUM");

  const face = computeCodeDiscountPence({
    kind: input.kind,
    value: input.value,
    subtotalPence: input.subtotalPence,
  });

  // Two caps, the same pair `clampRedemption` applies to points:
  //  1. never more than the goods — delivery is not discountable, or a code
  //     would pay for postage the shop still owes a courier;
  //  2. never a payable total below what the payment provider will accept.
  const headroom = input.subtotalPence + input.deliveryFeePence - MIN_PAYABLE_PENCE;
  const maxDiscountPence = Math.max(0, Math.min(input.subtotalPence, headroom));
  const discountPence = Math.min(face, maxDiscountPence);

  // A zero discount is refused rather than returned as a success. Applying a
  // code that changes nothing, silently, is how a shopper finds out at the card
  // that their code did nothing — the same reasoning that makes an unusable code
  // fail the checkout instead of being ignored.
  if (discountPence <= 0) return refuse("NO_HEADROOM");

  return { ok: true, discountPence };
}

/** Shopper-facing copy for each refusal. One message per reason, no fallthrough. */
export function refusalMessage(reason: CodeRefusalReason): string {
  switch (reason) {
    case "UNKNOWN":
      return "That discount code isn't recognised.";
    case "INACTIVE":
      return "That discount code is no longer available.";
    case "NOT_STARTED":
      return "That discount code isn't active yet.";
    case "EXPIRED":
      return "That discount code has expired.";
    case "BELOW_MINIMUM":
      return "Your order isn't large enough for that discount code.";
    case "USAGE_LIMIT_REACHED":
      return "That discount code has been fully claimed.";
    case "CUSTOMER_LIMIT_REACHED":
      return "You've already used that discount code.";
    case "SIGN_IN_REQUIRED":
      return "Please sign in to use that discount code.";
    case "NO_HEADROOM":
      return "That discount code can't be applied to this order.";
  }
}
