import { describe, it, expect } from "vitest";
import {
  dayName,
  parseExpressWindowInput,
  parseFulfilmentSettings,
  parseSlotInput,
  MAX_BOOKING_WINDOW_DAYS,
  MAX_SLOT_HOLD_MINUTES,
  isSupportedTimeZone,
  supportedTimeZones,
} from "../lib/fulfilment-form";

/**
 * `lib/fulfilment-form.ts` (#750).
 *
 * These rules are not cosmetic. `#401`/`#402` consume the values they guard:
 * `lib/repositories/fulfilment-slots.ts` sorts slots by `startTime.localeCompare(...)` and
 * `SlotPicker` compares an express window against the wall clock as text, so a non-`HH:mm` value
 * sorts and compares wrongly rather than erroring; and `capacity` is the real overbooking guard
 * that `lib/repositories/orders.ts` counts against, so a zero produces a slot that renders and can
 * never be booked. Each of those is a feature that silently does not work — the exact failure
 * `#750` exists to remove — so the parsers are where it has to be caught.
 */

const VALID_SLOT = {
  method: "DELIVERY",
  dayOfWeek: "2",
  startTime: "09:00",
  endTime: "11:00",
  capacity: "8",
};

const VALID_SETTINGS = {
  offerDeliverySlots: true,
  expressCollectionEnabled: false,
  bookingWindowDays: "14",
  slotHoldDurationMinutes: "15",
  timezone: "Europe/London",
};

describe("parseSlotInput", () => {
  it("accepts a well-formed slot and returns typed values", () => {
    const parsed = parseSlotInput(VALID_SLOT);
    expect(parsed).toEqual({
      ok: true,
      value: {
        method: "DELIVERY",
        dayOfWeek: 2,
        startTime: "09:00",
        endTime: "11:00",
        capacity: 8,
      },
    });
  });

  it("accepts COLLECTION as a method", () => {
    const parsed = parseSlotInput({ ...VALID_SLOT, method: "COLLECTION" });
    expect(parsed.ok && parsed.value.method).toBe("COLLECTION");
  });

  it.each([
    ["an unknown method", { method: "POSTAL" }, "method"],
    ["an empty method", { method: "" }, "method"],
    ["a day above the week", { dayOfWeek: "7" }, "dayOfWeek"],
    ["a negative day", { dayOfWeek: "-1" }, "dayOfWeek"],
    ["a non-integer day", { dayOfWeek: "2.5" }, "dayOfWeek"],
    ["an empty day", { dayOfWeek: "" }, "dayOfWeek"],
    ["a 12-hour start time", { startTime: "9am" }, "startTime"],
    ["an unpadded start time", { startTime: "9:00" }, "startTime"],
    ["a 24th hour", { startTime: "24:00" }, "startTime"],
    ["a 60th minute", { startTime: "09:60" }, "startTime"],
    ["an empty start time", { startTime: "" }, "startTime"],
    ["a malformed end time", { endTime: "later" }, "endTime"],
    ["a zero capacity", { capacity: "0" }, "capacity"],
    ["a negative capacity", { capacity: "-3" }, "capacity"],
    ["a fractional capacity", { capacity: "2.5" }, "capacity"],
    ["an empty capacity", { capacity: "" }, "capacity"],
  ])("rejects %s against the %s field", (_label, override, field) => {
    const parsed = parseSlotInput({ ...VALID_SLOT, ...override });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error.field).toBe(field);
  });

  it("rejects an end time before the start time", () => {
    const parsed = parseSlotInput({ ...VALID_SLOT, startTime: "14:00", endTime: "09:00" });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error.field).toBe("endTime");
  });

  it("rejects a zero-length window, which would render and never be deliverable", () => {
    const parsed = parseSlotInput({ ...VALID_SLOT, startTime: "09:00", endTime: "09:00" });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error.field).toBe("endTime");
  });

  it("accepts a window that crosses noon, which plain numeric comparison would get wrong", () => {
    const parsed = parseSlotInput({ ...VALID_SLOT, startTime: "09:00", endTime: "17:30" });
    expect(parsed.ok).toBe(true);
  });

  it("trims surrounding whitespace rather than rejecting it", () => {
    const parsed = parseSlotInput({ ...VALID_SLOT, startTime: " 09:00 ", capacity: " 8 " });
    expect(parsed.ok).toBe(true);
  });
});

describe("parseExpressWindowInput", () => {
  it("accepts a well-formed window", () => {
    const parsed = parseExpressWindowInput({
      dayOfWeek: "3",
      openTime: "10:00",
      closeTime: "16:00",
    });
    expect(parsed).toEqual({
      ok: true,
      value: { dayOfWeek: 3, openTime: "10:00", closeTime: "16:00" },
    });
  });

  it("rejects a close time at or before the open time", () => {
    for (const closeTime of ["10:00", "09:00"]) {
      const parsed = parseExpressWindowInput({ dayOfWeek: "3", openTime: "10:00", closeTime });
      expect(parsed.ok).toBe(false);
      expect(!parsed.ok && parsed.error.field).toBe("closeTime");
    }
  });

  it("rejects a malformed opening time", () => {
    const parsed = parseExpressWindowInput({
      dayOfWeek: "3",
      openTime: "10am",
      closeTime: "16:00",
    });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error.field).toBe("openTime");
  });

  it("rejects an out-of-range day", () => {
    const parsed = parseExpressWindowInput({
      dayOfWeek: "9",
      openTime: "10:00",
      closeTime: "16:00",
    });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error.field).toBe("dayOfWeek");
  });
});

describe("parseFulfilmentSettings", () => {
  it("accepts well-formed settings and carries both flags through", () => {
    const parsed = parseFulfilmentSettings({ ...VALID_SETTINGS, expressCollectionEnabled: true });
    expect(parsed).toEqual({
      ok: true,
      value: {
        offerDeliverySlots: true,
        expressCollectionEnabled: true,
        bookingWindowDays: 14,
        slotHoldDurationMinutes: 15,
        timezone: "Europe/London",
      },
    });
  });

  it("treats an unchecked flag as a deliberate false rather than a missing field", () => {
    const parsed = parseFulfilmentSettings({
      ...VALID_SETTINGS,
      offerDeliverySlots: false,
      expressCollectionEnabled: false,
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.offerDeliverySlots).toBe(false);
  });

  it.each([
    ["zero", "0"],
    ["negative", "-1"],
    ["fractional", "7.5"],
    ["non-numeric", "abc"],
    ["empty", ""],
    ["above the maximum", String(MAX_BOOKING_WINDOW_DAYS + 1)],
  ])("rejects a %s booking window", (_label, bookingWindowDays) => {
    const parsed = parseFulfilmentSettings({ ...VALID_SETTINGS, bookingWindowDays });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error.field).toBe("bookingWindowDays");
  });

  it.each([
    ["zero", "0"],
    ["negative", "-5"],
    ["fractional", "15.5"],
    ["non-numeric", "abc"],
    ["empty", ""],
    ["above the maximum", String(MAX_SLOT_HOLD_MINUTES + 1)],
  ])("rejects a %s slot hold", (_label, slotHoldDurationMinutes) => {
    const parsed = parseFulfilmentSettings({ ...VALID_SETTINGS, slotHoldDurationMinutes });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error.field).toBe("slotHoldDurationMinutes");
  });

  it("accepts both bounds exactly", () => {
    const parsed = parseFulfilmentSettings({
      ...VALID_SETTINGS,
      bookingWindowDays: String(MAX_BOOKING_WINDOW_DAYS),
      slotHoldDurationMinutes: String(MAX_SLOT_HOLD_MINUTES),
    });
    expect(parsed.ok).toBe(true);
  });
});

describe("dayName", () => {
  it("maps the schema's 0 = Sunday convention", () => {
    expect(dayName(0)).toBe("Sunday");
    expect(dayName(6)).toBe("Saturday");
  });

  it("does not throw on an index the parsers would have rejected", () => {
    expect(dayName(9)).toBe("Unknown");
  });
});

/**
 * #363 — the timezone field on the fulfilment settings form.
 *
 * Validation is by asking `Intl` rather than by matching an allow-list: the only zone that is
 * genuinely valid is one this runtime can actually convert with, which is what
 * `lib/local-datetime.ts` will be handed.
 */
describe("timezone validation", () => {
  it("accepts a real IANA zone", () => {
    expect(isSupportedTimeZone("Asia/Karachi")).toBe(true);
  });

  it("rejects a well-shaped but unknown zone", () => {
    expect(isSupportedTimeZone("Not/AZone")).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
  ])("rejects %s", (_label, value) => {
    expect(isSupportedTimeZone(value)).toBe(false);
  });

  it("carries a valid zone through parseFulfilmentSettings", () => {
    const parsed = parseFulfilmentSettings({ ...VALID_SETTINGS, timezone: "Asia/Karachi" });
    expect(parsed.ok && parsed.value.timezone).toBe("Asia/Karachi");
  });

  it("returns a field error for an invalid zone rather than throwing", () => {
    const parsed = parseFulfilmentSettings({ ...VALID_SETTINGS, timezone: "Not/AZone" });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error.field).toBe("timezone");
  });

  it("offers a non-empty zone list containing the platform default", () => {
    const zones = supportedTimeZones();
    expect(zones.length).toBeGreaterThan(0);
    expect(zones).toContain("Europe/London");
    expect(zones).toContain("Europe/Dublin");
    expect(zones).toContain("Asia/Karachi");
  });
});
