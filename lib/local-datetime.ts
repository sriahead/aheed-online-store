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
 * ## Why the timezone is a constant
 *
 * `STORE_TIMEZONE` is platform-wide rather than a `Vendor` column: both seeded
 * vendors are UK, so a constant and a per-vendor field produce identical results
 * for every row that exists today. See ADR-004's "store timezone is a constant,
 * not yet vendor data" note for what that defers and what it blocks (non-UK
 * vendor onboarding). Every caller already goes through these two functions, so
 * adding the column later means threading a vendor id in here — not a rewrite.
 */

export const STORE_TIMEZONE = "Europe/London";

/** `YYYY-MM-DDTHH:mm`, with the optional `:ss` a `step` attribute can add. */
const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

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
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
