import { describe, expect, it } from "vitest";
import {
  OVERRIDE_CLOSE_FIELD,
  OVERRIDE_DATE_FIELD,
  OVERRIDE_LABEL_FIELD,
  OVERRIDE_OPEN_FIELD,
  WEEKLY_HOURS_FIELD,
  parseHoursOverride,
  parseWeeklyHours,
  weekdayCloseField,
  weekdayOpenField,
} from "@/lib/footer-hours-form";

const day = (dayOfWeek: number, open = "", close = "", closed = false) => ({
  dayOfWeek,
  open,
  close,
  closed,
});

const errorField = (result: { ok: boolean; error?: { field: string } }) =>
  result.ok ? null : result.error!.field;

describe("parseWeeklyHours (#1060 R17)", () => {
  it("keeps a valid day and drops a day that is not set", () => {
    const result = parseWeeklyHours({
      days: [day(1, "09:00", "20:00"), day(2)],
      badges: [],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        weeklyHours: [{ dayOfWeek: 1, openTime: "09:00", closeTime: "20:00", closed: false }],
        paymentBadges: [],
      },
    });
  });

  it("stores a closed day's times as null whatever was typed", () => {
    const result = parseWeeklyHours({ days: [day(0, "09:00", "17:00", true)], badges: [] });
    expect(result.ok && result.value.weeklyHours).toEqual([
      { dayOfWeek: 0, openTime: null, closeTime: null, closed: true },
    ]);
  });

  it("refuses a half-filled day against the blank input", () => {
    expect(errorField(parseWeeklyHours({ days: [day(3, "09:00", "")], badges: [] }))).toBe(
      weekdayCloseField(3),
    );
    expect(errorField(parseWeeklyHours({ days: [day(3, "", "17:00")], badges: [] }))).toBe(
      weekdayOpenField(3),
    );
  });

  it.each(["24:00", "9:00", "09:60", "nine"])("refuses the time %s", (time) => {
    expect(errorField(parseWeeklyHours({ days: [day(4, time, "20:00")], badges: [] }))).toBe(
      weekdayOpenField(4),
    );
  });

  it("refuses a close time before (or equal to) the open time", () => {
    expect(errorField(parseWeeklyHours({ days: [day(5, "20:00", "09:00")], badges: [] }))).toBe(
      weekdayCloseField(5),
    );
    expect(errorField(parseWeeklyHours({ days: [day(5, "09:00", "09:00")], badges: [] }))).toBe(
      weekdayCloseField(5),
    );
  });

  it("refuses a duplicate or out-of-range dayOfWeek", () => {
    expect(
      errorField(parseWeeklyHours({ days: [day(1, "09:00", "17:00"), day(1)], badges: [] })),
    ).toBe(WEEKLY_HOURS_FIELD);
    expect(errorField(parseWeeklyHours({ days: [day(7, "09:00", "17:00")], badges: [] }))).toBe(
      WEEKLY_HOURS_FIELD,
    );
  });

  it("dedupes badges, puts them in display order and ignores unknown values", () => {
    const result = parseWeeklyHours({
      days: [],
      badges: ["GOOGLE_PAY", "VISA", "VISA", "BITCOIN"],
    });
    expect(result.ok && result.value.paymentBadges).toEqual(["VISA", "GOOGLE_PAY"]);
  });
});

describe("parseHoursOverride (#1060 R17)", () => {
  const TODAY = "2026-10-14";
  const valid = { date: "2026-12-25", label: "Christmas Day", open: "", close: "", closed: true };

  it("accepts a closed override and trims the label", () => {
    expect(parseHoursOverride({ ...valid, label: "  Christmas Day  " }, TODAY)).toEqual({
      ok: true,
      value: {
        date: "2026-12-25",
        label: "Christmas Day",
        openTime: null,
        closeTime: null,
        closed: true,
      },
    });
  });

  it("accepts an override with hours", () => {
    const result = parseHoursOverride(
      { ...valid, open: "10:00", close: "16:00", closed: false },
      TODAY,
    );
    expect(result.ok && result.value).toMatchObject({ openTime: "10:00", closeTime: "16:00" });
  });

  it("accepts today and today + 365", () => {
    expect(parseHoursOverride({ ...valid, date: TODAY }, TODAY).ok).toBe(true);
    expect(parseHoursOverride({ ...valid, date: "2027-10-14" }, TODAY).ok).toBe(true);
  });

  it.each([
    ["2026-02-30", "an impossible date"],
    ["2026-10-13", "yesterday"],
    ["2027-10-15", "today + 366"],
    ["14/10/2026", "a non-ISO date"],
  ])("refuses %s (%s)", (date) => {
    expect(errorField(parseHoursOverride({ ...valid, date }, TODAY))).toBe(OVERRIDE_DATE_FIELD);
  });

  it("refuses a blank or 41-character label", () => {
    expect(errorField(parseHoursOverride({ ...valid, label: "   " }, TODAY))).toBe(
      OVERRIDE_LABEL_FIELD,
    );
    expect(errorField(parseHoursOverride({ ...valid, label: "x".repeat(41) }, TODAY))).toBe(
      OVERRIDE_LABEL_FIELD,
    );
    expect(parseHoursOverride({ ...valid, label: "x".repeat(40) }, TODAY).ok).toBe(true);
  });

  it("applies the weekly times rules when not closed", () => {
    const open = { ...valid, closed: false };
    expect(errorField(parseHoursOverride({ ...open, open: "", close: "" }, TODAY))).toBe(
      OVERRIDE_OPEN_FIELD,
    );
    expect(errorField(parseHoursOverride({ ...open, open: "20:00", close: "09:00" }, TODAY))).toBe(
      OVERRIDE_CLOSE_FIELD,
    );
    expect(errorField(parseHoursOverride({ ...open, open: "09:00", close: "24:00" }, TODAY))).toBe(
      OVERRIDE_CLOSE_FIELD,
    );
  });
});
