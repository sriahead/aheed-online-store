import type { ParseResult } from "@/lib/catalogue-form";

/**
 * Fulfilment-scheduling field rules (P10, #750) — pure, DB-free, unit-tested.
 *
 * Same posture as `lib/delivery-area-form.ts`: every decision about what a submitted field MEANS
 * lives where a test can reach it without a database, a session or a request. The server actions in
 * `features/admin/fulfilment.ts` do the FormData reading and the repository calls; nothing here
 * knows either exists.
 *
 * ## Why this validation is load-bearing rather than cosmetic
 *
 * `#401` and `#402` shipped `VendorFulfilmentSlot` and `VendorExpressSchedule` with no writer at
 * all, so every stored value so far has been hand-authored. From `#750` these become admin-writable,
 * and three of the columns are consumed by logic that cannot defend itself:
 *
 * - `startTime`/`endTime` are plain `String` columns. `lib/repositories/fulfilment-slots.ts` sorts
 *   on `startTime.localeCompare(...)` and `components/checkout/SlotPicker.tsx` compares the express
 *   window against the current clock as text. Both are correct ONLY for zero-padded 24-hour `HH:mm`
 *   — `"9:00"` sorts after `"10:00"`, and a stored `"9am"` compares as neither.
 * - `capacity` is the real overbooking guard: `lib/repositories/orders.ts` counts orders inside the
 *   `slotHoldDurationMinutes` window against it. A zero or negative capacity produces a slot that
 *   renders and can never be booked.
 *
 * So a malformed value here does not look like a validation bug. It looks like the feature silently
 * not working — which is precisely the failure `#750` exists to remove, and it would be reintroduced
 * one row at a time through a settings screen.
 *
 * Errors are RETURNED, never thrown — every one of these is an ordinary thing for a human to mistype,
 * and the form has to re-render with the offending field named.
 */

/** Zero-padded 24-hour `HH:mm`, anchored at both ends. `"24:00"` and `"9:00"` are both rejected. */
const TIME_OF_DAY = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Upper bounds. Both are vendor-facing settings, not limits the schema imposes. */
export const MAX_BOOKING_WINDOW_DAYS = 60;
export const MAX_SLOT_HOLD_MINUTES = 120;

/** The `useActionState` shape shared by every form on /staff/fulfilment. */
export interface FulfilmentFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

/**
 * Seed value for `useActionState`.
 *
 * Lives here, not in `features/admin/fulfilment.ts`, because that file is `"use server"` — such a
 * module may export ONLY async functions, and a single value export makes every action in it 500 at
 * runtime while `next build`, `tsc --noEmit` and the whole test suite stay green (#159).
 */
export const initialFulfilmentState: FulfilmentFormState = {
  error: null,
  field: null,
  saved: false,
};

export interface FulfilmentSettingsInput {
  offerDeliverySlots: boolean;
  expressCollectionEnabled: boolean;
  bookingWindowDays: number;
  slotHoldDurationMinutes: number;
}

export interface SlotInput {
  method: "DELIVERY" | "COLLECTION";
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
}

export interface ExpressWindowInput {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

function invalid(
  field: string,
  message: string,
): { ok: false; error: { field: string; message: string } } {
  return { ok: false, error: { field, message } };
}

/** A zero-padded 24-hour clock time. Anything else — including `"9:00"` — is a field error. */
function parseTimeOfDay(raw: string, field: string, label: string): ParseResult<string> {
  const value = raw.trim();
  if (value === "") return invalid(field, `${label} is required.`);
  if (!TIME_OF_DAY.test(value)) {
    return invalid(field, `${label} must be a 24-hour time like 09:00 or 17:30.`);
  }
  return { ok: true, value };
}

/** A day index as the schema stores it: 0 = Sunday through 6 = Saturday. */
function parseDayOfWeek(raw: string): ParseResult<number> {
  const parsed = Number(raw.trim());
  if (raw.trim() === "" || !Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
    return invalid("dayOfWeek", "Choose a day of the week.");
  }
  return { ok: true, value: parsed };
}

function parseBoundedInteger(
  raw: string,
  field: string,
  label: string,
  min: number,
  max: number,
): ParseResult<number> {
  const value = raw.trim();
  const parsed = Number(value);
  if (value === "" || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    return invalid(field, `${label} must be a whole number between ${min} and ${max}.`);
  }
  return { ok: true, value: parsed };
}

/**
 * The four `VendorConfig` columns `#401`/`#402` read but nothing could write.
 *
 * Checkboxes are absent from FormData when unchecked, which is why both flags are read as
 * `=== "on"` rather than parsed — an absent checkbox is a deliberate `false`, not a missing field.
 */
export function parseFulfilmentSettings(raw: {
  offerDeliverySlots: boolean;
  expressCollectionEnabled: boolean;
  bookingWindowDays: string;
  slotHoldDurationMinutes: string;
}): ParseResult<FulfilmentSettingsInput> {
  const days = parseBoundedInteger(
    raw.bookingWindowDays,
    "bookingWindowDays",
    "The booking window",
    1,
    MAX_BOOKING_WINDOW_DAYS,
  );
  if (!days.ok) return days;

  const hold = parseBoundedInteger(
    raw.slotHoldDurationMinutes,
    "slotHoldDurationMinutes",
    "The slot hold",
    1,
    MAX_SLOT_HOLD_MINUTES,
  );
  if (!hold.ok) return hold;

  return {
    ok: true,
    value: {
      offerDeliverySlots: raw.offerDeliverySlots,
      expressCollectionEnabled: raw.expressCollectionEnabled,
      bookingWindowDays: days.value,
      slotHoldDurationMinutes: hold.value,
    },
  };
}

/**
 * One weekly slot.
 *
 * `endTime` must be strictly after `startTime`. An equal pair is rejected as well as an inverted
 * one: a zero-length window renders in the picker and can never be delivered in.
 */
export function parseSlotInput(raw: {
  method: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  capacity: string;
}): ParseResult<SlotInput> {
  const method = raw.method.trim();
  if (method !== "DELIVERY" && method !== "COLLECTION") {
    return invalid("method", "Choose delivery or collection.");
  }

  const day = parseDayOfWeek(raw.dayOfWeek);
  if (!day.ok) return day;

  const start = parseTimeOfDay(raw.startTime, "startTime", "The start time");
  if (!start.ok) return start;

  const end = parseTimeOfDay(raw.endTime, "endTime", "The end time");
  if (!end.ok) return end;

  // String comparison is sound here precisely because both sides are known zero-padded HH:mm.
  if (end.value <= start.value) {
    return invalid("endTime", "The end time must be after the start time.");
  }

  const capacity = parseBoundedInteger(raw.capacity, "capacity", "The capacity", 1, 9999);
  if (!capacity.ok) return capacity;

  return {
    ok: true,
    value: {
      method,
      dayOfWeek: day.value,
      startTime: start.value,
      endTime: end.value,
      capacity: capacity.value,
    },
  };
}

/** One express-collection window. Same time rules as a slot; no capacity column exists. */
export function parseExpressWindowInput(raw: {
  dayOfWeek: string;
  openTime: string;
  closeTime: string;
}): ParseResult<ExpressWindowInput> {
  const day = parseDayOfWeek(raw.dayOfWeek);
  if (!day.ok) return day;

  const open = parseTimeOfDay(raw.openTime, "openTime", "The opening time");
  if (!open.ok) return open;

  const close = parseTimeOfDay(raw.closeTime, "closeTime", "The closing time");
  if (!close.ok) return close;

  if (close.value <= open.value) {
    return invalid("closeTime", "The closing time must be after the opening time.");
  }

  return {
    ok: true,
    value: { dayOfWeek: day.value, openTime: open.value, closeTime: close.value },
  };
}

/** Sunday-first, matching the schema's `0 = Sunday` comment and the seed's own ordering. */
export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** `0` -> `"Sunday"`. Out-of-range indexes cannot reach here through the parsers above. */
export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? "Unknown";
}
