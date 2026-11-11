import type { HoursOverrideRow, WeeklyHoursRow } from "@/lib/footer-hours";
import {
  addCalendarDays,
  calendarDayInZone,
  calendarDayToUtcMidnight,
  parseLocalInput,
} from "@/lib/local-datetime";

/**
 * #1491 R4 — the warm-up windows for London calendar days today … today + 7, computed from the config
 * and every vendor's opening hours in this cell. Pure: no clock, no database, no KV.
 *
 * Wall-clock times convert to instants through `parseLocalInput`, which is DST-correct, so 09:00 is
 * 08:00Z in summer and 09:00Z in winter.
 */

export type DbWarmupModeName = "OPENING_HOURS" | "ALWAYS" | "CUSTOM" | "ACTIVITY_ONLY";

export interface WarmupScheduleConfig {
  enabled: boolean;
  mode: DbWarmupModeName;
  leadMinutes: number;
  customStart: string | null;
  customEnd: string | null;
}

export interface VendorOpeningHours {
  weeklyHours: WeeklyHoursRow[];
  overrides: HoursOverrideRow[];
}

export interface WarmupWindow {
  start: Date;
  end: Date;
}

/** Today plus seven: the scheduler stays correct for a week even if the daily refresh is missed. */
export const WARMUP_SCHEDULE_DAYS = 8;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHhMm(value: string | null | undefined): value is string {
  return typeof value === "string" && HHMM.test(value);
}

function atLocal(day: string, hhmm: string): Date | null {
  return parseLocalInput(`${day}T${hhmm}`);
}

/** The London calendar days covered, and the instant the schedule stops being valid. */
export function scheduleSpan(now: Date): { days: string[]; validUntil: Date } {
  const today = calendarDayInZone(now);
  const days = Array.from({ length: WARMUP_SCHEDULE_DAYS }, (_, i) => addCalendarDays(today, i));
  const validUntil =
    atLocal(addCalendarDays(today, WARMUP_SCHEDULE_DAYS), "00:00") ??
    new Date(now.getTime() + WARMUP_SCHEDULE_DAYS * 86_400_000);
  return { days, validUntil };
}

function mergeWindows(windows: WarmupWindow[]): WarmupWindow[] {
  const sorted = [...windows].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: WarmupWindow[] = [];
  for (const w of sorted) {
    const last = merged.at(-1);
    if (last && w.start.getTime() <= last.end.getTime()) {
      if (w.end.getTime() > last.end.getTime()) last.end = w.end;
    } else {
      merged.push({ start: w.start, end: w.end });
    }
  }
  return merged;
}

function openingHoursWindows(
  days: string[],
  leadMinutes: number,
  vendors: VendorOpeningHours[],
): WarmupWindow[] {
  const out: WarmupWindow[] = [];
  for (const day of days) {
    const weekday = calendarDayToUtcMidnight(day)?.getUTCDay();
    for (const vendor of vendors) {
      // An override on this exact date replaces the weekday's hours, closed or not.
      const source =
        vendor.overrides.find((o) => o.date === day) ??
        vendor.weeklyHours.find((w) => w.dayOfWeek === weekday);
      if (!source || source.closed || !isHhMm(source.openTime) || !isHhMm(source.closeTime)) {
        continue;
      }
      const open = atLocal(day, source.openTime);
      const close = atLocal(day, source.closeTime);
      if (!open || !close || open.getTime() >= close.getTime()) continue;
      out.push({ start: new Date(open.getTime() - leadMinutes * 60_000), end: close });
    }
  }
  return out;
}

export function computeWarmupWindows(input: {
  config: WarmupScheduleConfig;
  now: Date;
  vendors: VendorOpeningHours[];
}): WarmupWindow[] {
  const { config, now, vendors } = input;
  if (!config.enabled) return [];
  const { days, validUntil } = scheduleSpan(now);

  switch (config.mode) {
    case "ACTIVITY_ONLY":
      return [];
    case "ALWAYS": {
      const start = atLocal(days[0], "00:00");
      return start ? [{ start, end: validUntil }] : [];
    }
    case "CUSTOM": {
      const { customStart, customEnd } = config;
      if (!isHhMm(customStart) || !isHhMm(customEnd) || customStart >= customEnd) return [];
      const windows: WarmupWindow[] = [];
      for (const day of days) {
        const start = atLocal(day, customStart);
        const end = atLocal(day, customEnd);
        if (start && end) windows.push({ start, end });
      }
      return mergeWindows(windows);
    }
    case "OPENING_HOURS":
      return mergeWindows(openingHoursWindows(days, Math.max(0, config.leadMinutes), vendors));
  }
}
