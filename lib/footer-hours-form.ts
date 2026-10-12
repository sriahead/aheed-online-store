import type { ParseResult } from "@/lib/catalogue-form";
import {
  isPaymentBadgeMethod,
  orderPaymentBadges,
  type PaymentBadgeMethodName,
} from "@/lib/payment-badges";

/**
 * Storefront footer opening hours & payment badges (#1055) — pure, DB-free, unit-tested.
 *
 * Hours are free-text label/value rows ("Monday – Friday" / "9am – 8pm"), not per-day times: the
 * approved defaults are placeholders such as "[OPEN] – 8pm", and the grouping is the vendor's own.
 * The parsed result is the COMPLETE replacement set — the repository deletes and re-inserts both
 * tables in one transaction — so a row left out of the submission is a row removed.
 */

export const MAX_OPENING_HOURS_ROWS = 8;
export const OPENING_HOURS_TEXT_MAX = 40;

export const openingHoursLabelField = (index: number) => `hoursLabel-${index}`;
export const openingHoursValueField = (index: number) => `hoursValue-${index}`;
export const OPENING_HOURS_FIELD = "openingHours";
export const PAYMENT_BADGE_FIELD = "paymentBadge";

export interface FooterHoursInput {
  openingHours: { label: string; hours: string; sortOrder: number }[];
  paymentBadges: PaymentBadgeMethodName[];
}

/** `useActionState` shape — here, not in the `"use server"` file (#159). */
export interface FooterHoursFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

export const initialFooterHoursState: FooterHoursFormState = {
  error: null,
  field: null,
  saved: false,
};

/**
 * `rows` in submitted order. A row with both fields blank is dropped (that is how an admin deletes
 * one); a row with exactly one blank is an error against the blank input. `sortOrder` is the
 * position among the KEPT rows, so dropping a middle row leaves no gap.
 */
export function parseFooterHours(raw: {
  rows: { label: string; hours: string }[];
  badges: string[];
}): ParseResult<FooterHoursInput> {
  if (raw.rows.length > MAX_OPENING_HOURS_ROWS) {
    return {
      ok: false,
      error: {
        field: OPENING_HOURS_FIELD,
        message: `Add at most ${MAX_OPENING_HOURS_ROWS} opening-hours rows.`,
      },
    };
  }

  const openingHours: FooterHoursInput["openingHours"] = [];
  for (const [index, row] of raw.rows.entries()) {
    const label = row.label.trim();
    const hours = row.hours.trim();
    if (label === "" && hours === "") continue;
    if (label === "") {
      return {
        ok: false,
        error: {
          field: openingHoursLabelField(index),
          message: "Add a label for these hours, e.g. Saturday.",
        },
      };
    }
    if (hours === "") {
      return {
        ok: false,
        error: { field: openingHoursValueField(index), message: `Add the hours for ${label}.` },
      };
    }
    if (label.length > OPENING_HOURS_TEXT_MAX) {
      return {
        ok: false,
        error: {
          field: openingHoursLabelField(index),
          message: `Labels must be ${OPENING_HOURS_TEXT_MAX} characters or fewer.`,
        },
      };
    }
    if (hours.length > OPENING_HOURS_TEXT_MAX) {
      return {
        ok: false,
        error: {
          field: openingHoursValueField(index),
          message: `Hours must be ${OPENING_HOURS_TEXT_MAX} characters or fewer.`,
        },
      };
    }
    openingHours.push({ label, hours, sortOrder: openingHours.length });
  }

  // Unknown values are ignored rather than refused: the checkboxes are a fixed set, so an unknown
  // value can only be a forged submission, and dropping it writes nothing it did not mean.
  const paymentBadges = orderPaymentBadges(raw.badges.filter(isPaymentBadgeMethod));

  return { ok: true, value: { openingHours, paymentBadges } };
}
