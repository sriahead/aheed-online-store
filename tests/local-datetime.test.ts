import { describe, expect, it } from "vitest";
import {
  STORE_TIMEZONE,
  addCalendarDays,
  calendarDayInZone,
  calendarDayToUtcMidnight,
  formatLocalInput,
  parseLocalInput,
  zoneWallClock,
} from "@/lib/local-datetime";

/**
 * P8.5f — `datetime-local` ⇄ instant conversion (R17-R19).
 *
 * The point of these tests is NOT that the arithmetic is right for one date;
 * it is that the result **does not depend on the process's own timezone**. That
 * is the property whose absence caused the bug: `new Date("2026-08-25T07:25")`
 * silently means a different instant on a Worker (UTC) than on a UK laptop.
 *
 * R19 runs this whole file twice — `TZ=UTC` and `TZ=America/New_York` — and
 * requires an identical pass count. Every expectation below is therefore written
 * as an absolute UTC instant, never as a local-clock read: an assertion using
 * `getHours()` would itself inherit the runtime zone and pass under both runs
 * while proving nothing.
 */

/** 25 Aug 2026 is inside British Summer Time (UTC+1). */
const BST_INPUT = "2026-08-25T07:25";
const BST_INSTANT = "2026-08-25T06:25:00.000Z";

/** 15 Jan 2026 is GMT (UTC+0). */
const GMT_INPUT = "2026-01-15T07:25";
const GMT_INSTANT = "2026-01-15T07:25:00.000Z";

describe("STORE_TIMEZONE", () => {
  it("is Europe/London", () => {
    expect(STORE_TIMEZONE).toBe("Europe/London");
  });
});

describe("parseLocalInput", () => {
  it("reads a summer (BST) wall-clock time as UTC+1", () => {
    expect(parseLocalInput(BST_INPUT)?.toISOString()).toBe(BST_INSTANT);
  });

  it("reads a winter (GMT) wall-clock time as UTC+0", () => {
    expect(parseLocalInput(GMT_INPUT)?.toISOString()).toBe(GMT_INSTANT);
  });

  it("returns null for a blank value", () => {
    expect(parseLocalInput("")).toBeNull();
    expect(parseLocalInput("   ")).toBeNull();
  });

  it("returns null for an unparsable value rather than an Invalid Date", () => {
    expect(parseLocalInput("not-a-date")).toBeNull();
    expect(parseLocalInput("2026-13-45T99:99")).toBeNull();
    // A bare date with no time is not what datetime-local submits.
    expect(parseLocalInput("2026-08-25")).toBeNull();
  });

  it("accepts the optional seconds a step attribute can add", () => {
    expect(parseLocalInput("2026-08-25T07:25:30")?.toISOString()).toBe("2026-08-25T06:25:30.000Z");
  });

  it("resolves both sides of the BST transition correctly", () => {
    // BST began 29 Mar 2026 at 01:00 UTC.
    expect(parseLocalInput("2026-03-29T00:30")?.toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(parseLocalInput("2026-03-29T02:30")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("honours an explicitly passed timezone over the store default", () => {
    // 07:25 in New York on a summer date is UTC-4.
    expect(parseLocalInput(BST_INPUT, "America/New_York")?.toISOString()).toBe(
      "2026-08-25T11:25:00.000Z",
    );
  });
});

describe("formatLocalInput", () => {
  it("inverts parseLocalInput across BST", () => {
    expect(formatLocalInput(parseLocalInput(BST_INPUT))).toBe(BST_INPUT);
  });

  it("inverts parseLocalInput across GMT", () => {
    expect(formatLocalInput(parseLocalInput(GMT_INPUT))).toBe(GMT_INPUT);
  });

  it("renders a stored instant as the store's wall-clock time", () => {
    expect(formatLocalInput(new Date(BST_INSTANT))).toBe(BST_INPUT);
    expect(formatLocalInput(new Date(GMT_INSTANT))).toBe(GMT_INPUT);
  });

  it("returns a blank string for null or an invalid date", () => {
    expect(formatLocalInput(null)).toBe("");
    expect(formatLocalInput(new Date("nonsense"))).toBe("");
  });

  it("pads every component to a value an input will accept", () => {
    expect(formatLocalInput(new Date("2026-01-05T09:07:00.000Z"))).toBe("2026-01-05T09:07");
  });

  it("does not shift a midnight boundary (h23, never hour 24)", () => {
    // Midnight GMT: the whole date must stay on the 15th.
    expect(formatLocalInput(new Date("2026-01-15T00:00:00.000Z"))).toBe("2026-01-15T00:00");
  });
});

describe("round trip", () => {
  it("is stable for every hour of a BST day", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const input = `2026-08-25T${String(hour).padStart(2, "0")}:15`;
      expect(formatLocalInput(parseLocalInput(input))).toBe(input);
    }
  });

  it("is stable for every hour of a GMT day", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const input = `2026-01-15T${String(hour).padStart(2, "0")}:15`;
      expect(formatLocalInput(parseLocalInput(input))).toBe(input);
    }
  });
});

/**
 * #811 — the calendar-day helpers.
 *
 * Same property as everything above: the result must not depend on the process's own timezone.
 * These exist because the checkout slot picker treated a calendar day as an instant, so during
 * BST it asked the server for one day and the server answered for another.
 */

describe("calendarDayInZone", () => {
  it("returns the day the ZONE is on, not the day UTC is on", () => {
    // 23:30Z on the 18th is already the 19th in London during BST — the exact shape of #811.
    expect(calendarDayInZone(new Date("2026-09-18T23:30:00Z"), "Europe/London")).toBe("2026-09-19");
    expect(calendarDayInZone(new Date("2026-09-18T23:30:00Z"), "UTC")).toBe("2026-09-18");
  });

  it("goes the other way for a negative offset", () => {
    expect(calendarDayInZone(new Date("2026-09-19T02:00:00Z"), "America/New_York")).toBe(
      "2026-09-18",
    );
  });

  it("agrees with UTC in winter, when London has no offset", () => {
    expect(calendarDayInZone(new Date("2026-01-15T23:30:00Z"), "Europe/London")).toBe("2026-01-15");
  });

  it("defaults to the platform zone", () => {
    expect(calendarDayInZone(new Date("2026-09-18T23:30:00Z"))).toBe("2026-09-19");
  });
});

describe("calendarDayToUtcMidnight", () => {
  it("anchors a day to its own UTC midnight", () => {
    expect(calendarDayToUtcMidnight("2026-09-19")?.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("refuses a day that does not exist in its own month", () => {
    // Date.UTC would roll this into March rather than refusing it.
    expect(calendarDayToUtcMidnight("2026-02-31")).toBeNull();
  });

  it.each([
    ["an instant", "2026-09-19T00:00:00.000Z"],
    ["a partial day", "2026-09"],
    ["an unpadded day", "2026-9-19"],
    ["empty", ""],
    ["nonsense", "not-a-day"],
  ])("refuses %s", (_label, value) => {
    expect(calendarDayToUtcMidnight(value)).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(calendarDayToUtcMidnight(" 2026-09-19 ")?.toISOString()).toBe(
      "2026-09-19T00:00:00.000Z",
    );
  });
});

describe("addCalendarDays", () => {
  it("crosses a month boundary", () => {
    expect(addCalendarDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("crosses a year boundary", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("counts backwards", () => {
    expect(addCalendarDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("does not skip or repeat a day across the spring-forward boundary", () => {
    // 29 March 2026 is the UK's spring-forward Sunday: a 23-hour local day.
    expect(addCalendarDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addCalendarDays("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("returns an unparsable day unchanged rather than throwing", () => {
    expect(addCalendarDays("not-a-day", 1)).toBe("not-a-day");
  });
});

describe("zoneWallClock", () => {
  it("reads the weekday and time the VENDOR's clock shows", () => {
    // 23:30Z Friday 18 Sep is 00:30 Saturday in London (BST).
    expect(zoneWallClock(new Date("2026-09-18T23:30:00Z"), "Europe/London")).toEqual({
      dayOfWeek: 6,
      hhmm: "00:30",
    });
  });

  it("reads the same instant differently in another zone", () => {
    expect(zoneWallClock(new Date("2026-09-18T23:30:00Z"), "UTC")).toEqual({
      dayOfWeek: 5,
      hhmm: "23:30",
    });
  });

  it("zero-pads the hour so a text comparison against an HH:mm column is sound", () => {
    expect(zoneWallClock(new Date("2026-01-15T09:05:00Z"), "Europe/London").hhmm).toBe("09:05");
  });
});
