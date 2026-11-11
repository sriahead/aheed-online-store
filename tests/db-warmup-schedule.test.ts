import { describe, expect, it } from "vitest";
import {
  computeWarmupWindows,
  scheduleSpan,
  type VendorOpeningHours,
  type WarmupScheduleConfig,
} from "@/lib/db-warmup/schedule";
import { estimateWarmupCost } from "@/lib/db-warmup/estimate";
import type { WeeklyHoursRow } from "@/lib/footer-hours";

/**
 * #1491 R4/R5 — warm-up windows (Europe/London, DST-correct) and the cost estimate.
 * `specs/2026-11-10-db-warmup-ping/`.
 */

const BASE: WarmupScheduleConfig = {
  enabled: true,
  mode: "OPENING_HOURS",
  leadMinutes: 30,
  customStart: null,
  customEnd: null,
};

const everyDay = (openTime: string, closeTime: string): WeeklyHoursRow[] =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, openTime, closeTime, closed: false }));

const vendor = (
  weeklyHours: WeeklyHoursRow[],
  overrides: VendorOpeningHours["overrides"] = [],
) => ({
  weeklyHours,
  overrides,
});

// A summer Wednesday (BST, UTC+1) and a winter Wednesday (GMT, UTC+0).
const SUMMER = new Date("2026-07-15T10:00:00Z");
const WINTER = new Date("2026-11-11T10:00:00Z");

const iso = (d: Date) => d.toISOString();

describe("computeWarmupWindows (#1491 R4)", () => {
  it("disabled -> no windows", () => {
    expect(
      computeWarmupWindows({
        config: { ...BASE, enabled: false },
        now: SUMMER,
        vendors: [vendor(everyDay("09:00", "20:00"))],
      }),
    ).toEqual([]);
  });

  it("one vendor 09:00–20:00 with a 30-minute lead -> 08:30–20:00 London: 07:30Z in summer, 08:30Z in winter", () => {
    const summer = computeWarmupWindows({
      config: BASE,
      now: SUMMER,
      vendors: [vendor(everyDay("09:00", "20:00"))],
    });
    expect(summer).toHaveLength(8);
    expect(iso(summer[0].start)).toBe("2026-07-15T07:30:00.000Z");
    expect(iso(summer[0].end)).toBe("2026-07-15T19:00:00.000Z");

    const winter = computeWarmupWindows({
      config: BASE,
      now: WINTER,
      vendors: [vendor(everyDay("09:00", "20:00"))],
    });
    expect(iso(winter[0].start)).toBe("2026-11-11T08:30:00.000Z");
    expect(iso(winter[0].end)).toBe("2026-11-11T20:00:00.000Z");
  });

  it("two vendors whose hours overlap are merged into one window per day", () => {
    const windows = computeWarmupWindows({
      config: { ...BASE, leadMinutes: 0 },
      now: WINTER,
      vendors: [vendor(everyDay("09:00", "17:00")), vendor(everyDay("16:00", "20:00"))],
    });
    expect(windows).toHaveLength(8);
    expect(iso(windows[0].start)).toBe("2026-11-11T09:00:00.000Z");
    expect(iso(windows[0].end)).toBe("2026-11-11T20:00:00.000Z");
  });

  it("a closed override removes that day for that vendor only; another vendor still opens", () => {
    const closedToday = [
      { date: "2026-11-11", label: "Closed", openTime: null, closeTime: null, closed: true },
    ];
    const one = computeWarmupWindows({
      config: { ...BASE, leadMinutes: 0 },
      now: WINTER,
      vendors: [vendor(everyDay("09:00", "20:00"), closedToday)],
    });
    expect(one.some((w) => iso(w.start).startsWith("2026-11-11"))).toBe(false);
    expect(one).toHaveLength(7);

    const two = computeWarmupWindows({
      config: { ...BASE, leadMinutes: 0 },
      now: WINTER,
      vendors: [
        vendor(everyDay("09:00", "20:00"), closedToday),
        vendor(everyDay("10:00", "12:00")),
      ],
    });
    expect(iso(two[0].start)).toBe("2026-11-11T10:00:00.000Z");
    expect(iso(two[0].end)).toBe("2026-11-11T12:00:00.000Z");
  });

  it("an override with different hours replaces the weekday's hours for that date", () => {
    const late = [
      { date: "2026-11-11", label: "Late", openTime: "12:00", closeTime: "22:00", closed: false },
    ];
    const [first] = computeWarmupWindows({
      config: { ...BASE, leadMinutes: 0 },
      now: WINTER,
      vendors: [vendor(everyDay("09:00", "20:00"), late)],
    });
    expect(iso(first.start)).toBe("2026-11-11T12:00:00.000Z");
    expect(iso(first.end)).toBe("2026-11-11T22:00:00.000Z");
  });

  it("a weekday marked closed, or with no row, has no window", () => {
    const hours = everyDay("09:00", "20:00").map((r) =>
      r.dayOfWeek === 3 ? { ...r, closed: true } : r,
    );
    // 2026-11-11 is a Wednesday (dayOfWeek 3).
    const windows = computeWarmupWindows({ config: BASE, now: WINTER, vendors: [vendor(hours)] });
    expect(windows.some((w) => iso(w.end).startsWith("2026-11-11"))).toBe(false);
    expect(computeWarmupWindows({ config: BASE, now: WINTER, vendors: [vendor([])] })).toEqual([]);
  });

  it("ALWAYS -> one window from the start of today to validUntil", () => {
    const windows = computeWarmupWindows({
      config: { ...BASE, mode: "ALWAYS" },
      now: WINTER,
      vendors: [],
    });
    expect(windows).toHaveLength(1);
    expect(iso(windows[0].start)).toBe("2026-11-11T00:00:00.000Z");
    expect(windows[0].end.getTime()).toBe(scheduleSpan(WINTER).validUntil.getTime());
  });

  it("CUSTOM 07:00–21:00 -> one window per day; start >= end or unset -> none", () => {
    const ok = computeWarmupWindows({
      config: { ...BASE, mode: "CUSTOM", customStart: "07:00", customEnd: "21:00" },
      now: WINTER,
      vendors: [],
    });
    expect(ok).toHaveLength(8);
    expect(iso(ok[0].start)).toBe("2026-11-11T07:00:00.000Z");
    for (const bad of [
      { customStart: "21:00", customEnd: "07:00" },
      { customStart: "09:00", customEnd: "09:00" },
      { customStart: null, customEnd: "09:00" },
    ]) {
      expect(
        computeWarmupWindows({
          config: { ...BASE, mode: "CUSTOM", ...bad },
          now: WINTER,
          vendors: [],
        }),
      ).toEqual([]);
    }
  });

  it("ACTIVITY_ONLY -> no scheduled windows", () => {
    expect(
      computeWarmupWindows({
        config: { ...BASE, mode: "ACTIVITY_ONLY" },
        now: WINTER,
        vendors: [vendor(everyDay("09:00", "20:00"))],
      }),
    ).toEqual([]);
  });

  it("across the October clock change, 09:00 London is 08:00Z before and 09:00Z after", () => {
    // UK clocks go back on Sunday 2026-10-25. Start on Saturday the 24th.
    const windows = computeWarmupWindows({
      config: { ...BASE, leadMinutes: 0 },
      now: new Date("2026-10-24T10:00:00Z"),
      vendors: [vendor(everyDay("09:00", "20:00"))],
    });
    const byDay = new Map(windows.map((w) => [iso(w.start).slice(0, 10), iso(w.start)]));
    expect(byDay.get("2026-10-24")).toBe("2026-10-24T08:00:00.000Z");
    expect(byDay.get("2026-10-25")).toBe("2026-10-25T09:00:00.000Z");
  });

  it("validUntil is midnight London at the start of day 8", () => {
    expect(iso(scheduleSpan(WINTER).validUntil)).toBe("2026-11-19T00:00:00.000Z");
  });
});

describe("estimateWarmupCost (#1491 R5)", () => {
  const PRICE = { computeMilliUnits: 250, priceMicroUsdPerCuHour: 106000 };

  it("7 windows of 11.5 h at 0.25 CU / $0.106 -> about 88.0 CU-h and $9.33 a month; always-on 182.5 CU-h / $19.35", () => {
    const start = new Date("2026-11-11T00:00:00Z");
    const windows = Array.from({ length: 7 }, (_, d) => ({
      start: new Date(start.getTime() + d * 86_400_000 + 8.5 * 3_600_000),
      end: new Date(start.getTime() + d * 86_400_000 + 20 * 3_600_000),
    }));
    const e = estimateWarmupCost(windows, PRICE, start);
    expect(e.windowHoursPerWeek).toBeCloseTo(80.5, 5);
    expect(e.windowsPerWeek).toBe(7);
    expect(e.cuHoursPerMonth).toBeCloseTo(88.03, 1);
    expect(e.usdPerMonth).toBeCloseTo(9.33, 2);
    expect(e.alwaysOnCuHoursPerMonth).toBeCloseTo(182.5, 5);
    expect(e.alwaysOnUsdPerMonth).toBeCloseTo(19.345, 3);
  });

  it("no windows -> zero cost", () => {
    const e = estimateWarmupCost([], PRICE, new Date("2026-11-11T00:00:00Z"));
    expect(e.cuHoursPerMonth).toBe(0);
    expect(e.usdPerMonth).toBe(0);
  });

  it("only the first 7 days count (an 8-day ALWAYS window is clipped to one week)", () => {
    const start = new Date("2026-11-11T00:00:00Z");
    const e = estimateWarmupCost(
      [{ start, end: new Date(start.getTime() + 8 * 86_400_000) }],
      PRICE,
      start,
    );
    expect(e.windowHoursPerWeek).toBeCloseTo(168, 5);
  });
});
