"use server";

import { getAvailableSlotsForVendor } from "@/lib/fulfilment-slots-service";
import { calendarDayToUtcMidnight } from "@/lib/local-datetime";
import { DAYS_PER_PAGE } from "@/lib/slot-grid";
import type { FulfilmentMethod } from "@/lib/repositories/fulfilment-slots";

// NOTE: this file may export async functions and nothing else (CLAUDE.md's Server Actions section).

export async function getAvailableSlotsForDate(
  vendorId: string,
  method: FulfilmentMethod,
  /** #811 — a `YYYY-MM-DD` calendar day, never an instant. */
  day: string,
) {
  return getAvailableSlotsForVendor(vendorId, method, day);
}

/**
 * One page of the slot grid in one round trip (#1305): the existing per-day lookup for each day,
 * in the order given. A server action is a public endpoint, so the input is bounded rather than
 * trusted: at most one page of days, and anything that is not a real calendar day is dropped
 * (`getAvailableSlotsForDate`'s repository would return `[]` for it anyway, but there is no reason
 * to spend a query finding that out).
 */
export async function getAvailableSlotsForWeek(
  vendorId: string,
  method: FulfilmentMethod,
  /** `YYYY-MM-DD` calendar days, never instants. */
  days: string[],
) {
  const valid = days
    .slice(0, DAYS_PER_PAGE)
    .filter((day) => typeof day === "string" && calendarDayToUtcMidnight(day) !== null);
  return Promise.all(
    valid.map(async (day) => ({
      day,
      slots: await getAvailableSlotsForVendor(vendorId, method, day),
    })),
  );
}
