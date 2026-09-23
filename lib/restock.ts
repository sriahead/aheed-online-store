/**
 * #876 — the expected restock date, as a calendar DAY (`YYYY-MM-DD`), never an instant.
 *
 * Stored as `Inventory.expectedRestockDate`: the UTC midnight of the vendor-local day, the same
 * convention as `Order.fulfilmentDate` (#811). Everything in this file works on the `YYYY-MM-DD`
 * label, so nothing here depends on the server's, the Worker's or the browser's timezone. It is
 * pure and client-safe: `ProductCard` and `QuickViewDrawer` import it.
 */

/** The stored instant back to its day label. The stored value IS a UTC midnight, so UTC is right. */
export function restockDayFromStored(stored: Date | null | undefined): string | null {
  return stored ? stored.toISOString().slice(0, 10) : null;
}

/**
 * The day to show a shopper, or `null` once it has passed. `today` is the VENDOR-local day,
 * supplied by the request-scoped caller. `YYYY-MM-DD` strings order correctly as plain strings.
 */
export function currentRestockDay(day: string | null, today: string): string | null {
  return day !== null && day >= today ? day : null;
}

const RESTOCK_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** e.g. "Mon 28 Sept" (ICU's en-GB month). `timeZone: "UTC"` because the input is a label at UTC midnight, not a moment. */
export function formatRestockDay(day: string): string {
  return RESTOCK_DAY_FORMAT.format(new Date(`${day}T00:00:00.000Z`));
}
