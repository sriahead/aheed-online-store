import type { DeliveryEligibility } from "@/lib/delivery-eligibility";
import { addCalendarDays, calendarDayInZone, calendarDayToUtcMidnight } from "@/lib/local-datetime";

/**
 * What, if anything, a delivery-eligibility verdict should count as an out-of-area refusal (#889) —
 * pure, so the rule is testable without a database or a request.
 *
 * Only `OUTSIDE_DELIVERY_AREA` counts: a postcode the reference database confirmed is real, which
 * this vendor does not serve. `INVALID_POSTCODE` (a typo) and `UNVERIFIED` (a reference coverage or
 * connectivity gap) are never evidence of demand, and `DELIVERABLE` is not a refusal.
 *
 * `district` is the outward code of the canonical spaced postcode (`MK17 8NL` → `MK17`) — never the
 * full postcode, which is what keeps the counts free of personal data. `day` is the vendor-local
 * calendar day as the UTC-midnight `Date` a `@db.Date` column stores.
 */
export function refusalRecordFor(
  eligibility: DeliveryEligibility,
  now: Date,
  timeZone: string,
): { district: string; day: Date } | null {
  if (eligibility.status !== "OUTSIDE_DELIVERY_AREA") return null;

  const district = eligibility.postcode.trim().toUpperCase().split(/\s+/)[0];
  const day = calendarDayToUtcMidnight(calendarDayInZone(now, timeZone));
  if (!district || !day) return null;
  return { district, day };
}

/** The first vendor-local day of the staff table's "last 30 days" window, inclusive of today. */
export function refusalWindowStart(now: Date, timeZone: string, days = 30): Date {
  const today = calendarDayInZone(now, timeZone);
  // A well-formed day string always converts; the fallback only satisfies the type.
  return calendarDayToUtcMidnight(addCalendarDays(today, -(days - 1))) ?? new Date(0);
}
