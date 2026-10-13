/**
 * #729 — the "Shop your list" examples, built from the CURRENT VENDOR's own products.
 *
 * The examples used to be a fixed grocery list ("2x chicken breast", "5kg basmati rice", "milk",
 * "apples x 3"), which rendered on every vendor — an electronics shop's shoppers were shown chicken
 * breast. Deriving them from the vendor's own in-stock product names is correct for any vendor,
 * including one onboarded later, with no setting to fill in. A vendor with no products gets
 * neutral wording that names no kind of product at all.
 *
 * #1077 — THE PLACEHOLDER IS NO LONGER THE EXAMPLES, and the reason is worth recording because the
 * obvious fix was wrong. The textarea's placeholder used to BE a worked three-line list, so
 * shoppers read it as a list that was already there and submitted without typing (owner testing,
 * triage item 18). The first attempt dimmed it to `text-black/40`, which
 * `tests/token-alpha-purity.test.ts` (#649) correctly rejected — and the measurement underneath
 * that guard is the real finding: the permitted floor `text-black/60` is 5.74:1 while the
 * placeholder's existing `text-primary-muted` (#49784e) is 5.21:1, so EVERY colour the guard
 * allows is more prominent than what was already there. "Make it fainter" was unachievable.
 *
 * So the content changed instead of the colour. The placeholder is now one prompt line that cannot
 * be mistaken for data, and the vendor-derived example moved to the hint above the box (where
 * triage item 19 had just put it, so a shopper reads how quantities work BEFORE typing). Contrast
 * is untouched and #649 stays intact.
 *
 * `exampleName` is therefore the only vendor-derived value left here — but the picking logic below
 * is unchanged, because it is what guarantees that name is real, in stock and this vendor's own.
 *
 * Pure and request-free so it can be unit-tested; the page does the vendor-scoped fetch.
 */

/** How many product names the examples consider at most. */
export const MAX_EXAMPLE_NAMES = 3;

/**
 * The textarea's prompt — #1077. One line, imperative, and deliberately naming no product at all:
 * anything resembling an entry is what made shoppers think the list was pre-filled.
 */
export const LIST_PLACEHOLDER = "Type or paste your list, one item per line";

export interface ListExamples {
  /** The textarea placeholder. A fixed prompt since #1077 — never an example list. */
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

  return {
    placeholder: LIST_PLACEHOLDER,
    exampleName: picked[0] ?? null,
  };
}
