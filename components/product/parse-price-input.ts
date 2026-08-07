/**
 * Pure, unit-tested. Counterpart to formatPrice(): parses a user-typed pounds
 * string into integer pence for the repository layer. Blank, non-numeric, or
 * negative input returns undefined (filter not applied), never zero/NaN.
 */
export function parsePriceInput(pounds: string): number | undefined {
  const trimmed = pounds.trim();
  if (!trimmed) return undefined;

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;

  return Math.round(value * 100);
}
