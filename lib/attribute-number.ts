/**
 * #918 — the one definition of a NUMBER vendor-filter value ("65 W", "13.3 in").
 *
 * Stored as `Decimal(10,2)` (a measurement, not money, so not integer pence), but no Prisma
 * `Decimal` ever leaves `lib/repositories/`: React cannot serialise one into a client component
 * (`ProductCard` is one), so numbers travel as strings and are rendered by `formatAttributeNumber`.
 *
 * The same rule validates the staff product form's number input and a shopper's
 * `attr_<slug>_min`/`_max` URL bound, so a value the form accepts is always one the filter can take.
 *
 * Pure: no Prisma, no request context.
 */

/** Up to 8 whole digits and 2 decimals, never negative — what `Decimal(10,2)` can hold. */
const NUMBER_RULE = /^\d{1,8}(\.\d{1,2})?$/;

export const ATTRIBUTE_NUMBER_ERROR =
  "Enter a number from 0 to 99999999.99, with at most 2 decimal places.";

/** The trimmed string when it passes the number rule; `null` otherwise, including an array. */
export function parseAttributeNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return NUMBER_RULE.test(trimmed) ? trimmed : null;
}

/**
 * `("13.30", "in")` → `"13.3 in"`, `("15.00", null)` → `"15"`, `("0.50", "m")` → `"0.5 m"`.
 * Trailing zeros after the point go, then a point left trailing; the unit follows a space.
 */
export function formatAttributeNumber(value: string, unit: string | null): string {
  const trimmed = value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return unit ? `${trimmed} ${unit}` : trimmed;
}
