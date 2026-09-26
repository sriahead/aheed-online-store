/**
 * #729 — the "Shop your list" textarea's examples, built from the CURRENT VENDOR's own products.
 *
 * The examples used to be a fixed grocery list ("2x chicken breast", "5kg basmati rice", "milk",
 * "apples x 3"), which rendered on every vendor — an electronics shop's shoppers were shown chicken
 * breast. Deriving them from the vendor's own in-stock product names is correct for any vendor,
 * including one onboarded later, with no setting to fill in. A vendor with no products gets
 * neutral wording that names no kind of product at all.
 *
 * Pure and request-free so it can be unit-tested; the page does the vendor-scoped fetch.
 */

/** How many product names the examples use at most — one per placeholder line. */
export const MAX_EXAMPLE_NAMES = 3;

/** Shown when the vendor has no in-stock product to borrow a name from. */
export const NEUTRAL_LIST_PLACEHOLDER = "2x first item\nsecond item\nthird item x 3";

export interface ListExamples {
  /** The textarea placeholder: one example per line, showing each quantity form once. */
  placeholder: string;
  /** The name the quantity hint illustrates with, or null to use the neutral hint. */
  exampleName: string | null;
}

export function buildListExamples(names: string[]): ListExamples {
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name === "") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(name);
    if (picked.length === MAX_EXAMPLE_NAMES) break;
  }

  if (picked.length === 0) {
    return { placeholder: NEUTRAL_LIST_PLACEHOLDER, exampleName: null };
  }

  // The three lines demonstrate a leading quantity, no quantity, and a trailing quantity.
  const lines = [`2x ${picked[0]}`];
  if (picked[1] !== undefined) lines.push(picked[1]);
  if (picked[2] !== undefined) lines.push(`${picked[2]} x 3`);
  return { placeholder: lines.join("\n"), exampleName: picked[0] };
}
