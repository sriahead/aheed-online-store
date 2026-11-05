/**
 * #1435 — the slot label, e.g. `Thursday 6 November, 10:00–12:00`.
 *
 * `Order.fulfilmentDate` is always the UTC midnight of the vendor-local calendar day
 * (`lib/local-datetime.ts`), so the day is read in UTC: that is the stored day exactly, whatever the
 * Worker's clock or the season. Reading it in `Europe/London` gives the same day (London is never
 * behind UTC), but UTC says what the column means. `startTime`/`endTime` are already vendor-local
 * `HH:MM` strings.
 *
 * Pure and import-free, so a client component can use it.
 */
export function slotLabel(
  fulfilmentDate: Date | null,
  slot: { startTime: string; endTime: string } | null,
): string | null {
  if (!fulfilmentDate || !slot) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).formatToParts(fulfilmentDate);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}, ${slot.startTime}–${slot.endTime}`;
}
