/**
 * `datetime-local` ⇄ instant conversion, pinned to the store's timezone (P8.5f).
 *
 * Pure, DB-free, session-free, request-free — same posture as lib/campaign-form.ts
 * and lib/product-image.ts: every rule about what a submitted date MEANS lives
 * where a test reaches it without a database, a session or a request.
 *
 * ## The bug this exists to kill
 *
 * An `<input type="datetime-local">` submits a NAKED wall-clock string —
 * `"2026-08-25T07:25"` — with no timezone designator at all. ECMAScript specifies
 * that such a string is interpreted as **the runtime's own local time**. That
 * makes `new Date(value)` mean something different depending on where it runs:
 * UTC on a Cloudflare Worker, Europe/London on a UK laptop, America/New_York in
 * someone else's CI.
 *
 * Before this module, `lib/campaign-form.ts` parsed with a bare `new Date(value)`
 * on the Worker (so `07:25` became `07:25Z`) and `CampaignForm.tsx` rendered it
 * back with `date.getHours()` in the admin's browser (so `07:25Z` displayed as
 * `08:25` in BST). Write and read assumed two different zones and the gap between
 * them was exactly the UK's summer offset — the database held an instant nobody
 * had chosen. `lint`, `typecheck` and `test` all stayed green throughout, because
 * each of them runs in a single process where the two wrong assumptions cancel.
 *
 * ## Why this fixes it
 *
 * Both directions name their zone EXPLICITLY and read the offset from
 * `Intl.DateTimeFormat`, never from the process clock. The result therefore does
 * not depend on where the code runs — Worker, CI runner, or browser — which is
 * the property tests/local-datetime.test.ts asserts by running under two very
 * different `TZ` values and expecting identical output.
 *
 * ## The timezone used to be a constant. It is now vendor data (#363).
 *
 * `STORE_TIMEZONE` was platform-wide for P8.5f, and that was the right call at
 * the time: both seeded vendors are UK, so a constant and a per-vendor field
 * produced identical results for every row that existed, and #362 was a
 * CORRECTNESS bug about the two sides disagreeing — which zone it is matters
 * only when a vendor is somewhere else.
 *
 * Since #363 the zone lives on `VendorConfig.timezone` and reaches these
 * functions as an explicit argument, resolved by the caller through
 * `VendorProfile.timezone` (`lib/repositories/vendor.ts`). `STORE_TIMEZONE`
 * survives as the PLATFORM DEFAULT — the value a vendor with no config row
 * falls back to — not as the answer. This module stays pure, DB-free,
 * session-free and request-free: it never looks a vendor up, it is told.
 *
 * ## The calendar-day helpers, and why they take no zone on the way back (#811)
 *
 * A calendar day is not an instant, and treating it as one is what broke the
 * checkout slot picker for the whole of British Summer Time. `SlotPicker` sent
 * browser-local midnight as an ISO instant and the Worker read the weekday off
 * it with a UTC `getDay()`, so a customer picking Saturday was shown Friday's
 * slots — every hour of every day from late March to late October, not an edge
 * case near midnight. Under `next dev` on a UK laptop both sides are BST and the
 * two errors cancel exactly, which is the same way #362 hid.
 *
 * So the wire format between a picker and the server is a plain `YYYY-MM-DD`
 * calendar day, and `Order.fulfilmentDate` is always the UTC midnight of that
 * day. The zone is needed ONCE, at the top, to decide which calendar day "today"
 * is for this vendor; after that no further zone reasoning happens, because
 * there is nothing left to get wrong.
 */

/**
 * The platform default zone — what a vendor with no `VendorConfig` row resolves
 * to. `lib/repositories/vendor.ts` re-exports this as `DEFAULT_TIMEZONE`.
 */
export const STORE_TIMEZONE = "Europe/London";

/** `YYYY-MM-DDTHH:mm`, with the optional `:ss` a `step` attribute can add. */
const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** A bare calendar day, the wire format between a date picker and the server. */
const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * `h23` rather than `hour12: false` deliberately: `hour12: false` is specified to
 * produce hour `24` for midnight in some locales/engines, which would silently
 * push a date forward by a day.
 */
function zoneParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * How far `timeZone` is ahead of UTC at a given instant, in milliseconds
 * (+3600000 for Europe/London during BST, 0 during GMT).
 *
 * Works by rendering the instant as wall-clock in the target zone and re-reading
 * those parts as though they were UTC; the difference is the offset.
 */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const p = zoneParts(new Date(instantMs), timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Round to the second: `instantMs` may carry milliseconds the parts can't.
  return asIfUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * A `datetime-local` value read as wall-clock time IN `timeZone`, returned as the
 * instant it names. `null` for blank or unparsable input — callers treat that as
 * "not a valid date" and surface their own field error.
 *
 * The two-pass offset lookup handles DST boundaries: the first guess applies the
 * offset in force at the wall-clock time *treated as UTC*, which can be the wrong
 * side of a transition; the second re-reads the offset at the resulting instant
 * and corrects when they disagree. A wall-clock time inside the spring-forward
 * gap (which does not exist) resolves to the instant immediately after the jump
 * rather than throwing — the same forgiving behaviour a browser's own picker has.
 */
export function parseLocalInput(value: string, timeZone: string = STORE_TIMEZONE): Date | null {
  const match = INPUT_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mi = Number(minute);
  const s = Number(second ?? "0");

  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(wallAsUtc)) return null;

  /*
   * `Date.UTC` ROLLS OVER rather than rejecting: `Date.UTC(2026, 12, 45, 99, 99)`
   * is a perfectly good instant in 2027, and `2026-02-31` silently becomes 3
   * March. The regex above only proves the SHAPE is right, so the components are
   * re-read from the result and compared — the one check that rejects both an
   * out-of-range field and a date that doesn't exist in its own month.
   */
  const back = new Date(wallAsUtc);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d ||
    back.getUTCHours() !== h ||
    back.getUTCMinutes() !== mi ||
    back.getUTCSeconds() !== s
  ) {
    return null;
  }

  const firstGuess = zoneOffsetMs(wallAsUtc, timeZone);
  let instant = wallAsUtc - firstGuess;

  const corrected = zoneOffsetMs(instant, timeZone);
  if (corrected !== firstGuess) instant = wallAsUtc - corrected;

  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result;
}

/**
 * The inverse: an instant rendered as the `YYYY-MM-DDTHH:mm` wall-clock string
 * `timeZone` would show for it, ready for an input's `value`/`defaultValue`.
 * Blank string for null/invalid, matching what an empty input submits.
 *
 * Server and client produce the SAME string for the same instant, because the
 * zone is named rather than inherited — which is what stops a value from shifting
 * between SSR and hydration.
 */
export function formatLocalInput(date: Date | null, timeZone: string = STORE_TIMEZONE): string {
  if (date === null || Number.isNaN(date.getTime())) return "";

  const p = zoneParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/* -------------------------------------------------------------------------------------------- *
 * Calendar days (#811)
 *
 * A calendar day is a label, not a point in time. These four keep it that way — see the "calendar
 * day" section of this file's header for the defect that made them necessary.
 * -------------------------------------------------------------------------------------------- */

/**
 * The `YYYY-MM-DD` calendar day `instant` falls on IN `timeZone`.
 *
 * This is the one place the zone is needed in the slot-picking path: it answers "which day is it
 * where the vendor is", and every later step works on the resulting string.
 */
export function calendarDayInZone(instant: Date, timeZone: string = STORE_TIMEZONE): string {
  const p = zoneParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * The instant at UTC midnight of a `YYYY-MM-DD` day, or `null` for anything that isn't one.
 *
 * This is the stored form: `Order.fulfilmentDate` is ALWAYS the UTC midnight of the vendor-local
 * calendar day, which is what makes an exact-equality capacity query correct. `tests/slot-capacity`
 * and `tests/concurrency-slot-booking` already assumed it before #811 made it true in production.
 *
 * Rejects a well-shaped but impossible day: `Date.UTC` rolls `2026-02-31` over into March rather
 * than refusing it, so the components are re-read from the result and compared — the same guard
 * `parseLocalInput` uses above.
 */
export function calendarDayToUtcMidnight(day: string): Date | null {
  const match = CALENDAR_DAY_PATTERN.exec(day.trim());
  if (!match) return null;

  const [, year, month, date] = match;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(date);

  const ms = Date.UTC(y, mo - 1, d);
  if (Number.isNaN(ms)) return null;

  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return back;
}

/**
 * `n` days after (or before, for a negative `n`) a `YYYY-MM-DD` day.
 *
 * Pure string-to-string arithmetic through UTC, so it cannot drift across a DST boundary the way
 * adding 86,400,000ms to a zoned instant does. An input that is not a calendar day is returned
 * unchanged rather than throwing — this module never throws — but callers derive `day` from
 * `calendarDayInZone`, so that branch is unreachable by construction.
 */
export function addCalendarDays(day: string, n: number): string {
  const base = calendarDayToUtcMidnight(day);
  if (base === null) return day;

  const moved = new Date(base.getTime());
  moved.setUTCDate(moved.getUTCDate() + n);
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/**
 * The weekday and `HH:mm` that `timeZone` reads at `instant`.
 *
 * `dayOfWeek` is `0` = Sunday, matching `VendorFulfilmentSlot.dayOfWeek` and `VendorExpressSchedule.
 * dayOfWeek`; `hhmm` is zero-padded 24-hour, matching the `HH:mm` string columns those rows carry,
 * so the caller can compare them as text exactly as `lib/fulfilment-form.ts` documents.
 *
 * Exists for the Express-collection window, which is the one part of the slot path that genuinely
 * needs a zone rather than a calendar day: "is the vendor open right now" is a question about the
 * vendor's wall clock, and the shopper's browser is the wrong clock to ask.
 */
export function zoneWallClock(
  instant: Date,
  timeZone: string = STORE_TIMEZONE,
): { dayOfWeek: number; hhmm: string } {
  const p = zoneParts(instant, timeZone);
  // Via the zone's own calendar day, so the weekday can never disagree with the date beside it.
  const dayOfWeek =
    calendarDayToUtcMidnight(calendarDayInZone(instant, timeZone))?.getUTCDay() ?? 0;
  return { dayOfWeek, hhmm: `${pad(p.hour)}:${pad(p.minute)}` };
}
