import type { ParseResult } from "@/lib/catalogue-form";
import type { HoursOverrideRow, WeeklyHoursRow } from "@/lib/footer-hours";
import { addCalendarDays, calendarDayToUtcMidnight } from "@/lib/local-datetime";
import {
  isPaymentBadgeMethod,
  orderPaymentBadges,
  type PaymentBadgeMethodName,
} from "@/lib/payment-badges";

/**
 * Storefront footer opening hours, holiday overrides & payment badges (#1055, #1060) — pure,
 * DB-free, unit-tested.
 *
 * Hours are real `HH:mm` times (the `VendorExpressSchedule` convention), one interval per day, with
 * close after open — hours past midnight and split days are out of scope (#1060 plan). "Closed all
 * day" stores both times as null. The weekly result is the COMPLETE replacement set: the repository
 * deletes and re-inserts the vendor's rows in one transaction, so a day left "not set" is removed.
 */

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const OVERRIDE_LABEL_MAX = 40;
/** How far ahead an override may be dated. */
export const OVERRIDE_MAX_DAYS_AHEAD = 365;

export const weekdayOpenField = (dayOfWeek: number) => `weekday-${dayOfWeek}-open`;
export const weekdayCloseField = (dayOfWeek: number) => `weekday-${dayOfWeek}-close`;
export const weekdayClosedField = (dayOfWeek: number) => `weekday-${dayOfWeek}-closed`;
export const WEEKLY_HOURS_FIELD = "weeklyHours";
export const PAYMENT_BADGE_FIELD = "paymentBadge";

export const OVERRIDE_DATE_FIELD = "overrideDate";
export const OVERRIDE_LABEL_FIELD = "overrideLabel";
export const OVERRIDE_OPEN_FIELD = "overrideOpen";
export const OVERRIDE_CLOSE_FIELD = "overrideClose";
export const OVERRIDE_CLOSED_FIELD = "overrideClosed";
export const OVERRIDE_ID_FIELD = "overrideId";

/** Monday → Sunday, the order the staff form and the footer both read. 0 = Sunday. */
export const WEEKDAYS = [
  { dayOfWeek: 1, name: "Monday" },
  { dayOfWeek: 2, name: "Tuesday" },
  { dayOfWeek: 3, name: "Wednesday" },
  { dayOfWeek: 4, name: "Thursday" },
  { dayOfWeek: 5, name: "Friday" },
  { dayOfWeek: 6, name: "Saturday" },
  { dayOfWeek: 0, name: "Sunday" },
] as const;

function dayName(dayOfWeek: number): string {
  return WEEKDAYS.find((d) => d.dayOfWeek === dayOfWeek)?.name ?? `Day ${dayOfWeek}`;
}

export interface FooterHoursInput {
  weeklyHours: WeeklyHoursRow[];
  paymentBadges: PaymentBadgeMethodName[];
}

/** `useActionState` shape — here, not in the `"use server"` file, which may export only async functions (#159). */
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

/** Same shape, for the "Holiday & closure dates" add and delete forms. */
export type HoursOverrideFormState = FooterHoursFormState;
export const initialHoursOverrideState: HoursOverrideFormState = initialFooterHoursState;

type Times = { openTime: string | null; closeTime: string | null; closed: boolean };

/**
 * The shared times rule. `closed` wins: its times are stored as null whatever was typed. Otherwise
 * both are required, each must be `HH:mm`, and open must be before close. Blank-and-not-closed is
 * the caller's decision ("not set" for a weekday, an error for an override).
 */
function parseTimes(
  raw: { open: string; close: string; closed: boolean },
  fields: { open: string; close: string },
  what: string,
): ParseResult<Times> {
  if (raw.closed) return { ok: true, value: { openTime: null, closeTime: null, closed: true } };
  const open = raw.open.trim();
  const close = raw.close.trim();
  if (open === "") {
    return {
      ok: false,
      error: {
        field: fields.open,
        message: `Add an opening time for ${what}, or tick Closed all day.`,
      },
    };
  }
  if (close === "") {
    return {
      ok: false,
      error: {
        field: fields.close,
        message: `Add a closing time for ${what}, or tick Closed all day.`,
      },
    };
  }
  if (!TIME_PATTERN.test(open)) {
    return {
      ok: false,
      error: { field: fields.open, message: `Enter ${what}'s opening time as HH:MM.` },
    };
  }
  if (!TIME_PATTERN.test(close)) {
    return {
      ok: false,
      error: { field: fields.close, message: `Enter ${what}'s closing time as HH:MM.` },
    };
  }
  // Zero-padded HH:mm strings compare correctly as text.
  if (open >= close) {
    return {
      ok: false,
      error: {
        field: fields.close,
        message: `${what}'s closing time must be after its opening time.`,
      },
    };
  }
  return { ok: true, value: { openTime: open, closeTime: close, closed: false } };
}

/**
 * The weekly hours form: 7 weekday entries plus the badge checkboxes. A day with both times blank
 * and "Closed all day" unticked is "not set" and dropped — that is how an admin hides a day.
 */
export function parseWeeklyHours(raw: {
  days: { dayOfWeek: number; open: string; close: string; closed: boolean }[];
  badges: string[];
}): ParseResult<FooterHoursInput> {
  const seen = new Set<number>();
  const weeklyHours: WeeklyHoursRow[] = [];

  for (const day of raw.days) {
    if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6) {
      return {
        ok: false,
        error: { field: WEEKLY_HOURS_FIELD, message: "That is not a day of the week." },
      };
    }
    if (seen.has(day.dayOfWeek)) {
      return {
        ok: false,
        error: { field: WEEKLY_HOURS_FIELD, message: `${dayName(day.dayOfWeek)} appears twice.` },
      };
    }
    seen.add(day.dayOfWeek);

    if (!day.closed && day.open.trim() === "" && day.close.trim() === "") continue;

    const times = parseTimes(
      day,
      { open: weekdayOpenField(day.dayOfWeek), close: weekdayCloseField(day.dayOfWeek) },
      dayName(day.dayOfWeek),
    );
    if (!times.ok) return times;
    weeklyHours.push({ dayOfWeek: day.dayOfWeek, ...times.value });
  }

  // Unknown values are ignored rather than refused: the checkboxes are a fixed set, so an unknown
  // value can only be a forged submission, and dropping it writes nothing it did not mean.
  const paymentBadges = orderPaymentBadges(raw.badges.filter(isPaymentBadgeMethod));

  return { ok: true, value: { weeklyHours, paymentBadges } };
}

/**
 * One holiday / closure override. `today` is the store-local `YYYY-MM-DD` day, passed in so this
 * stays pure: the date must be a real calendar day from today to today + 365.
 */
export function parseHoursOverride(
  raw: { date: string; label: string; open: string; close: string; closed: boolean },
  today: string,
): ParseResult<HoursOverrideRow> {
  const date = raw.date.trim();
  if (!calendarDayToUtcMidnight(date)) {
    return { ok: false, error: { field: OVERRIDE_DATE_FIELD, message: "Choose a valid date." } };
  }
  if (date < today) {
    return {
      ok: false,
      error: { field: OVERRIDE_DATE_FIELD, message: "Choose today or a later date." },
    };
  }
  if (date > addCalendarDays(today, OVERRIDE_MAX_DAYS_AHEAD)) {
    return {
      ok: false,
      error: { field: OVERRIDE_DATE_FIELD, message: "Choose a date within the next year." },
    };
  }

  const label = raw.label.trim();
  if (label === "") {
    return {
      ok: false,
      error: { field: OVERRIDE_LABEL_FIELD, message: "Add a name for this date, e.g. a holiday." },
    };
  }
  if (label.length > OVERRIDE_LABEL_MAX) {
    return {
      ok: false,
      error: {
        field: OVERRIDE_LABEL_FIELD,
        message: `Names must be ${OVERRIDE_LABEL_MAX} characters or fewer.`,
      },
    };
  }

  const times = parseTimes(raw, { open: OVERRIDE_OPEN_FIELD, close: OVERRIDE_CLOSE_FIELD }, label);
  if (!times.ok) return times;

  return { ok: true, value: { date, label, ...times.value } };
}
