import { describe, expect, it } from "vitest";
import {
  buildOpeningHoursView,
  formatHours,
  formatOverrideDate,
  formatTime,
  type HoursOverrideRow,
  type WeeklyHoursRow,
} from "@/lib/footer-hours";

const open = (dayOfWeek: number, openTime: string, closeTime: string): WeeklyHoursRow => ({
  dayOfWeek,
  openTime,
  closeTime,
  closed: false,
});

// Stored deliberately out of display order.
const WEEK: WeeklyHoursRow[] = [
  open(0, "09:00", "19:00"),
  open(3, "09:00", "20:00"),
  open(1, "09:00", "20:00"),
  open(6, "09:00", "20:00"),
  open(2, "09:00", "20:00"),
  open(5, "09:00", "20:00"),
  open(4, "09:00", "20:00"),
];

const override = (date: string, label: string, closed = true): HoursOverrideRow => ({
  date,
  label,
  openTime: closed ? null : "10:00",
  closeTime: closed ? null : "16:00",
  closed,
});

// Wednesday 2026-10-14, 12:00 BST.
const WEDNESDAY_NOON = new Date("2026-10-14T11:00:00Z");

describe("formatTime (#1060 R3)", () => {
  it.each([
    ["09:00", "9am"],
    ["09:30", "9:30am"],
    ["12:00", "12pm"],
    ["00:00", "12am"],
    ["20:00", "8pm"],
    ["23:45", "11:45pm"],
  ])("%s → %s", (input, output) => {
    expect(formatTime(input)).toBe(output);
  });

  it("joins a range with a spaced en dash and renders a closed day as Closed", () => {
    expect(formatHours({ openTime: "09:00", closeTime: "20:00", closed: false })).toBe("9am – 8pm");
    expect(formatHours({ openTime: null, closeTime: null, closed: true })).toBe("Closed");
  });

  it("formats a calendar day as Ddd D Mmm", () => {
    expect(formatOverrideDate("2026-12-25")).toBe("Fri 25 Dec");
  });
});

describe("buildOpeningHoursView (#1060 R4–R6)", () => {
  it("orders the weekly rows Monday → Sunday whatever the stored order", () => {
    const view = buildOpeningHoursView(WEEK, [], WEDNESDAY_NOON);
    expect(view.weekly.map((r) => r.day)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(view.weekly[6].text).toBe("9am – 7pm");
    expect(view.holidays).toEqual([]);
  });

  it("marks exactly one row as today", () => {
    const view = buildOpeningHoursView(WEEK, [], WEDNESDAY_NOON);
    expect(view.weekly.filter((r) => r.isToday).map((r) => r.day)).toEqual(["Wednesday"]);
  });

  it("shows a closed weekday as Closed", () => {
    const week = [...WEEK.filter((r) => r.dayOfWeek !== 3), { ...WEEK[1], closed: true }];
    const view = buildOpeningHoursView(
      week.map((r) => (r.dayOfWeek === 3 ? { ...r, openTime: null, closeTime: null } : r)),
      [],
      WEDNESDAY_NOON,
    );
    expect(view.weekly.find((r) => r.day === "Wednesday")?.text).toBe("Closed");
  });

  it("takes today from London, not UTC: Sunday 23:30 UTC in BST is Monday", () => {
    const view = buildOpeningHoursView(WEEK, [], new Date("2026-06-14T23:30:00Z"));
    expect(view.weekly.find((r) => r.isToday)?.day).toBe("Monday");
  });

  it("in GMT, Sunday 23:30 UTC is still Sunday", () => {
    const view = buildOpeningHoursView(WEEK, [], new Date("2026-12-20T23:30:00Z"));
    expect(view.weekly.find((r) => r.isToday)?.day).toBe("Sunday");
  });

  it("replaces today's row with today's override and does not list it again", () => {
    const view = buildOpeningHoursView(
      WEEK,
      [override("2026-10-14", "Staff training")],
      WEDNESDAY_NOON,
    );
    const today = view.weekly.find((r) => r.isToday);
    expect(today).toEqual({ day: "Wednesday", text: "Staff training · Closed", isToday: true });
    expect(view.holidays).toEqual([]);
  });

  it("leads Holiday hours with today's override when today has no weekly row", () => {
    const week = WEEK.filter((r) => r.dayOfWeek !== 3);
    const view = buildOpeningHoursView(
      week,
      [override("2026-10-16", "Later", false), override("2026-10-14", "Today only")],
      WEDNESDAY_NOON,
    );
    expect(view.weekly.some((r) => r.isToday)).toBe(false);
    expect(view.holidays).toEqual([
      { text: "Wed 14 Oct · Today only · Closed", isToday: true },
      { text: "Fri 16 Oct · Later · 10am – 4pm", isToday: false },
    ]);
  });

  it("includes today + 14, excludes today + 15 and past dates, in date order", () => {
    const view = buildOpeningHoursView(
      WEEK,
      [
        override("2026-10-29", "Day fifteen"),
        override("2026-10-28", "Day fourteen"),
        override("2026-10-13", "Yesterday"),
        override("2026-10-15", "Tomorrow", false),
      ],
      WEDNESDAY_NOON,
    );
    expect(view.holidays.map((h) => h.text)).toEqual([
      "Thu 15 Oct · Tomorrow · 10am – 4pm",
      "Wed 28 Oct · Day fourteen · Closed",
    ]);
  });

  it("renders a closed override as Closed in the spec's format", () => {
    const view = buildOpeningHoursView(
      WEEK,
      [override("2026-12-25", "Christmas Day")],
      new Date("2026-12-20T12:00:00Z"),
    );
    expect(view.holidays).toEqual([
      { text: "Fri 25 Dec · Christmas Day · Closed", isToday: false },
    ]);
  });
});
