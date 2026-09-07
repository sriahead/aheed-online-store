import type { FieldError, ParseResult } from "@/lib/catalogue-form";

/**
 * Delivery-rule field rules (P9.2, #634) — pure, DB-free, unit-tested.
 *
 * Same posture as `lib/delivery-area-form.ts` (#612) and `lib/catalogue-form.ts`: every decision
 * about what a submitted field MEANS lives where a test can reach it without a database, a session
 * or a request. `features/admin/storefront.ts` does the reading and the repository call; nothing
 * here knows either exists.
 *
 * ## Why a dedicated parser rather than `parsePriceInput`
 *
 * `components/product/parse-price-input.ts` exists and is the obvious reuse, but it answers a
 * different question. It returns `undefined` for blank, non-numeric AND negative alike — fine for a
 * price *filter*, where all three mean "not applied" — and it rounds with `Math.round(value * 100)`,
 * so `1.234` silently becomes `123`. Both behaviours are wrong here:
 *
 *  - **Blank must be distinguishable from invalid.** A blank free-delivery threshold is a real,
 *    meaningful choice (`null` = free delivery never offered) and must not be reported as a typo,
 *    while a blank delivery fee is a mistake and must be.
 *  - **Silently rounding a third decimal is a money bug.** An operator typing `2.999` should be
 *    told, not quietly charged `3.00`. `CLAUDE.md`'s money rule is integer pence with no floats;
 *    accepting only two decimals and converting by integer arithmetic honours that literally.
 *
 * ## Why this validation is load-bearing
 *
 * These three columns are read on the checkout path — `lib/order-totals.ts` applies the fee, the
 * threshold and the minimum to a payable total. Until now their only writer was `prisma/seed.ts`, a
 * hand-authored file with known-good values. Making them admin-writable means a bad value reaches
 * real money arithmetic, so the accepted shape is an anchored allow-list rather than a "looks
 * numeric" check.
 *
 * Errors are RETURNED, never thrown — a mistyped amount is an ordinary thing for a human to type,
 * and the form has to re-render with the field named.
 */

/** Pounds with at most two decimal places, no sign, no separators, no exponent. */
const POUNDS = /^\d+(\.\d{1,2})?$/;

export const DELIVERY_FEE_FIELD = "deliveryFeePence";
export const FREE_DELIVERY_THRESHOLD_FIELD = "freeDeliveryThresholdPence";
export const MINIMUM_ORDER_FIELD = "minimumOrderPence";

/** What the three delivery-rule columns hold, in the units the database stores. */
export interface DeliveryRulesInput {
  deliveryFeePence: number;
  /** `null` = free delivery is never offered. Deliberately distinct from `0`. */
  freeDeliveryThresholdPence: number | null;
  minimumOrderPence: number;
}

export interface DeliveryRulesFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

/**
 * Seed value for `useActionState`.
 *
 * Lives here, not in `features/admin/storefront.ts`, because that file is `"use server"` — such a
 * module may export ONLY async functions, and a single value export makes every action in it 500 at
 * runtime while `next build`, `tsc --noEmit` and the whole test suite stay green (#159).
 */
export const initialDeliveryRulesState: DeliveryRulesFormState = {
  error: null,
  field: null,
  saved: false,
};

function invalid(field: string, label: string): { ok: false; error: FieldError } {
  return {
    ok: false,
    error: {
      field,
      message: `${label} must be an amount in pounds, like 3.49 — no negatives, symbols or more than two decimal places.`,
    },
  };
}

/**
 * Parse a required pounds amount into integer pence.
 *
 * Conversion is integer arithmetic on the digit strings, not `value * 100`, so no binary floating
 * point ever touches a money value.
 */
export function parsePoundsToPence(raw: string, field: string, label: string): ParseResult<number> {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { ok: false, error: { field, message: `${label} is required.` } };
  }
  if (!POUNDS.test(trimmed)) {
    return invalid(field, label);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const pence = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(pence)) {
    return invalid(field, label);
  }

  return { ok: true, value: pence };
}

/**
 * Parse the free-delivery threshold, where blank is a valid answer meaning "never offered".
 *
 * The blank/zero distinction is the point: `null` hides the "spend £X more for free delivery"
 * prompt entirely, while `0` would make every order qualify.
 */
export function parseOptionalPoundsToPence(
  raw: string,
  field: string,
  label: string,
): ParseResult<number | null> {
  if (raw.trim() === "") return { ok: true, value: null };
  return parsePoundsToPence(raw, field, label);
}

/**
 * Validate all three delivery rules together, returning the first field error.
 *
 * All-or-nothing by design: a partially applied set of delivery rules is a worse state than a
 * rejected submission, because the three interact (a minimum above the free-delivery threshold is
 * coherent, a fee written without its threshold is not obviously anything).
 */
export function parseDeliveryRules(raw: {
  deliveryFee: string;
  freeDeliveryThreshold: string;
  minimumOrder: string;
}): ParseResult<DeliveryRulesInput> {
  const fee = parsePoundsToPence(raw.deliveryFee, DELIVERY_FEE_FIELD, "Delivery fee");
  if (!fee.ok) return fee;

  const threshold = parseOptionalPoundsToPence(
    raw.freeDeliveryThreshold,
    FREE_DELIVERY_THRESHOLD_FIELD,
    "Free delivery threshold",
  );
  if (!threshold.ok) return threshold;

  const minimum = parsePoundsToPence(raw.minimumOrder, MINIMUM_ORDER_FIELD, "Minimum order");
  if (!minimum.ok) return minimum;

  return {
    ok: true,
    value: {
      deliveryFeePence: fee.value,
      freeDeliveryThresholdPence: threshold.value,
      minimumOrderPence: minimum.value,
    },
  };
}

/** Integer pence back to the pounds string a form input shows. */
export function penceToPoundsValue(pence: number | null | undefined): string {
  return pence === null || pence === undefined ? "" : (pence / 100).toFixed(2);
}
