/** Pure, unit-tested. Parses a submitted rating string into a valid 1-5 integer, or null. */
export function parseRating(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return null;

  return parsed;
}
