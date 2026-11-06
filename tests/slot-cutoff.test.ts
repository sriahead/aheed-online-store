import { describe, expect, it } from "vitest";
import { isSlotBookable } from "@/lib/slot-cutoff";

/**
 * #1441 R4 — a slot is bookable only when it starts MORE than the cut-off after `now`, read in the
 * vendor's zone. Europe/London is GMT (UTC+0) on 2026-11-06 and BST (UTC+1) on 2026-07-10.
 */
const LONDON = "Europe/London";

describe("isSlotBookable", () => {
  describe("13:00 slot, 60-minute cut-off, GMT", () => {
    it("is bookable at 11:59", () => {
      expect(
        isSlotBookable("2026-11-06", "13:00", LONDON, 60, new Date("2026-11-06T11:59:00Z")),
      ).toBe(true);
    });

    it("is closed exactly at the cut-off, 12:00", () => {
      expect(
        isSlotBookable("2026-11-06", "13:00", LONDON, 60, new Date("2026-11-06T12:00:00Z")),
      ).toBe(false);
    });

    it("is closed once the slot has started, 14:00", () => {
      expect(
        isSlotBookable("2026-11-06", "13:00", LONDON, 60, new Date("2026-11-06T14:00:00Z")),
      ).toBe(false);
    });
  });

  describe("13:00 slot, 60-minute cut-off, BST", () => {
    it("is bookable at 11:59 local (10:59Z)", () => {
      expect(
        isSlotBookable("2026-07-10", "13:00", LONDON, 60, new Date("2026-07-10T10:59:00Z")),
      ).toBe(true);
    });

    it("is closed at 12:00 local (11:00Z)", () => {
      expect(
        isSlotBookable("2026-07-10", "13:00", LONDON, 60, new Date("2026-07-10T11:00:00Z")),
      ).toBe(false);
    });
  });

  describe("a cut-off that crosses midnight", () => {
    it("closes tomorrow's 00:30 slot at 23:45 tonight", () => {
      expect(
        isSlotBookable("2026-11-07", "00:30", LONDON, 60, new Date("2026-11-06T23:45:00Z")),
      ).toBe(false);
    });

    it("keeps it open at 23:29 tonight", () => {
      expect(
        isSlotBookable("2026-11-07", "00:30", LONDON, 60, new Date("2026-11-06T23:29:00Z")),
      ).toBe(true);
    });
  });

  describe("a cut-off of 0", () => {
    it("is bookable one minute before the start", () => {
      expect(
        isSlotBookable("2026-11-06", "13:00", LONDON, 0, new Date("2026-11-06T12:59:00Z")),
      ).toBe(true);
    });

    it("is closed at the start", () => {
      expect(
        isSlotBookable("2026-11-06", "13:00", LONDON, 0, new Date("2026-11-06T13:00:00Z")),
      ).toBe(false);
    });
  });

  it("leaves a future day well outside the cut-off bookable", () => {
    expect(
      isSlotBookable("2026-11-13", "09:00", LONDON, 60, new Date("2026-11-06T16:00:00Z")),
    ).toBe(true);
  });

  it.each([
    ["an unparsable day", "2026-02-31", "13:00"],
    ["a malformed day", "not-a-day", "13:00"],
    ["an unparsable start", "2026-11-06", "25:00"],
    ["a malformed start", "2026-11-06", "1pm"],
  ])("refuses %s", (_label, day, startTime) => {
    expect(isSlotBookable(day, startTime, LONDON, 60, new Date("2026-11-01T00:00:00Z"))).toBe(
      false,
    );
  });
});
