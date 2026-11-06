import { parseLocalInput } from "@/lib/local-datetime";

/**
 * #1441 — whether a fulfilment slot can still be booked.
 *
 * A slot is bookable only when its start, read as wall-clock time on `day` in the vendor's zone,
 * is MORE than `cutoffMinutes` after `now`. Exactly at the cut-off it is closed, so staff always get
 * the full notice they configured.
 *
 * The slot list (`getAvailableSlotsForDate`) and `placeOrder` both call this, so what checkout
 * offers and what it accepts cannot drift apart. The start goes through `parseLocalInput`, so a
 * 09:00 slot is 09:00 local time in both BST and GMT. Every day is checked, not just today, so a
 * cut-off that crosses midnight closes an early slot tomorrow too.
 *
 * Pure: the clock is a parameter, never read here.
 */
export function isSlotBookable(
  day: string,
  startTime: string,
  timeZone: string,
  cutoffMinutes: number,
  now: Date,
): boolean {
  const start = parseLocalInput(`${day}T${startTime}`, timeZone);
  if (start === null) return false;
  return start.getTime() - now.getTime() > cutoffMinutes * 60_000;
}
