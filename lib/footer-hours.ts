import {
  addCalendarDays,
  calendarDayInZone,
  calendarDayToUtcMidnight,
  zoneWallClock,
} from "@/lib/local-datetime";

/**
 * The storefront footer's opening hours (#1060) — pure, DB-free, unit-tested.
 *
 * Turns the vendor's weekly schedule and dated overrides into exactly what column 2 renders. The
 * current instant is a PARAMETER, never read here, so a test can pin "today" — including the
 * late-evening UTC instants where London is already on the next day.
 *
 * "Today" is the calendar day in `STORE_TIMEZONE`, from `lib/local-datetime.ts`; never the
 * server's UTC date.
 */

/** One weekday row as stored (`VendorWeeklyHours`). `dayOfWeek` is 0 = Sunday … 6 = Saturday. */
export interface WeeklyHoursRow {
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  closed: boolean;
}

/** One dated override as read (`VendorHoursOverride`), `date` as the `YYYY-MM-DD` calendar day. */
export interface HoursOverrideRow {
  date: string;
  label: string;
  openTime: string | null;
  closeTime: string | null;
  closed: boolean;
}

export interface OpeningHoursView {
  weekly: { day: string; text: string; isToday: boolean }[];
  holidays: { text: string; isToday: boolean }[];
}

/** How many days ahead an override is listed under "Holiday hours" (today + 1 … today + 14). */
export const HOLIDAY_WINDOW_DAYS = 14;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Monday first — the UK convention, and the order the owner's mockup reads. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** `"09:00"` → `"9am"`, `"09:30"` → `"9:30am"`, `"12:00"` → `"12pm"`, `"00:00"` → `"12am"`. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** The display text for one day's hours: `"9am – 8pm"` (en dash), or `"Closed"`. */
export function formatHours(row: {
  openTime: string | null;
  closeTime: string | null;
  closed: boolean;
}): string {
  if (row.closed || !row.openTime || !row.closeTime) return "Closed";
  return `${formatTime(row.openTime)} – ${formatTime(row.closeTime)}`;
}

/** `"2026-12-25"` → `"Fri 25 Dec"`, computed on the calendar day itself (no zone involved). */
export function formatOverrideDate(day: string): string {
  const instant = calendarDayToUtcMidnight(day);
  if (!instant) return day;
  const weekday = DAY_NAMES[instant.getUTCDay()].slice(0, 3);
  return `${weekday} ${instant.getUTCDate()} ${MONTH_SHORT[instant.getUTCMonth()]}`;
}

function overrideText(o: HoursOverrideRow): string {
  return `${formatOverrideDate(o.date)} · ${o.label} · ${formatHours(o)}`;
}

export function buildOpeningHoursView(
  weekly: readonly WeeklyHoursRow[],
  overrides: readonly HoursOverrideRow[],
  now: Date,
): OpeningHoursView {
  const today = calendarDayInZone(now);
  const todayDow = zoneWallClock(now).dayOfWeek;
  const lastDay = addCalendarDays(today, HOLIDAY_WINDOW_DAYS);
  const todayOverride = overrides.find((o) => o.date === today) ?? null;

  const byDay = new Map(weekly.map((row) => [row.dayOfWeek, row]));
  const weeklyView: OpeningHoursView["weekly"] = [];
  let todayOverrideShown = false;
  for (const dow of DISPLAY_ORDER) {
    const row = byDay.get(dow);
    if (!row) continue;
    const isToday = dow === todayDow;
    if (isToday && todayOverride) {
      weeklyView.push({
        day: DAY_NAMES[dow],
        text: `${todayOverride.label} · ${formatHours(todayOverride)}`,
        isToday,
      });
      todayOverrideShown = true;
    } else {
      weeklyView.push({ day: DAY_NAMES[dow], text: formatHours(row), isToday });
    }
  }

  // `YYYY-MM-DD` strings compare correctly as text, so the window is a plain string range.
  const upcoming = overrides
    .filter((o) => o.date > today && o.date <= lastDay)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((o) => ({ text: overrideText(o), isToday: false }));

  const holidays =
    todayOverride && !todayOverrideShown
      ? [{ text: overrideText(todayOverride), isToday: true }, ...upcoming]
      : upcoming;

  return { weekly: weeklyView, holidays };
}
