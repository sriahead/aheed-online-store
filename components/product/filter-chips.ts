/**
 * Applied-filter chips and clear-all (#568). Pure and unit-tested, for the same reason
 * `search-href.ts` beside it is: a page file cannot export a helper for a test to import (Next
 * permits only its own known exports), and a silently-dropped parameter here strands a shopper on
 * a listing that no longer matches what the chips say is applied.
 *
 * Serves BOTH browse pages. They build URLs differently — `/search` carries `q` and `category` and
 * paginates by offset `cursor`, while `/categories/[slug]` carries neither and additionally keeps
 * a `back` cursor stack (#498) — so this takes the base path and reads whichever keys are present
 * rather than assuming either page's shape.
 *
 * TWO RULINGS worth reading before changing anything here, both from `plan.md`:
 *
 * 1. **Removing a filter drops pagination** (`cursor`, and `back`). Staying on page 4 of a result
 *    set that just changed size is meaningless, and the Apply button already restarts pagination
 *    for exactly this reason (see ProductFilterForm's comment on why `cursor` is not carried).
 *
 * 2. **`q` is never a chip, and clear-all preserves it.** The query is already the page heading,
 *    and a chip that removed it would be visually indistinguishable from "Clear all" while doing
 *    something quite different — dumping the shopper into the whole catalogue rather than showing
 *    their search unfiltered.
 */

import { parsePriceInput } from "./parse-price-input";

export type FilterChipParams = {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  isHalal?: string;
  isFresh?: string;
  isOrganic?: string;
  featured?: string;
  category?: string;
  cursor?: string;
  back?: string;
};

export type FilterChip = {
  /** The query-string key this chip removes — also a stable React key. */
  key: string;
  label: string;
  href: string;
};

/**
 * Every removable filter key, in the order chips render. `q`, `cursor` and `back` are deliberately
 * absent: the first is not a filter (ruling 2 above), the other two are pagination (ruling 1).
 */
const REMOVABLE: (keyof FilterChipParams)[] = [
  "category",
  "inStock",
  "isHalal",
  "isFresh",
  "isOrganic",
  "featured",
  "minPrice",
  "maxPrice",
];

/** Pagination keys, dropped by every href this module builds. */
const PAGINATION: (keyof FilterChipParams)[] = ["cursor", "back"];

function buildHref(
  basePath: string,
  params: FilterChipParams,
  omit: readonly (keyof FilterChipParams)[],
): string {
  const qs = new URLSearchParams();
  const keys: (keyof FilterChipParams)[] = ["q", ...REMOVABLE];
  for (const key of keys) {
    if (omit.includes(key)) continue;
    const value = params[key];
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * `"2.5"` -> `"£2.50"`. Price params travel through the URL in POUNDS, as the shopper typed them
 * into the form; `parsePriceInput` is what converts to pence at the repository boundary. Reused
 * here rather than re-parsed so a chip can never disagree with the filter actually applied.
 */
function formatPricePence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * The chip's text, or `null` when this value applies no filter at all.
 *
 * The `null` case is what stops a chip from lying: `?minPrice=abc` reaches the page, applies
 * nothing (`parsePriceInput` returns undefined for blank, non-numeric or negative input), and must
 * therefore not render a chip claiming a price filter the shopper cannot see the effect of.
 */
function labelFor(
  key: keyof FilterChipParams,
  value: string,
  categoryLabel?: string,
): string | null {
  switch (key) {
    case "category":
      // The slug is the fallback only when the page could not resolve a name — which for a rendered
      // chip should not happen, since an unresolvable category applies no filter at all.
      return categoryLabel ?? value;
    case "inStock":
      return "In stock only";
    case "isHalal":
      return "Halal";
    case "isFresh":
      return "Fresh";
    case "isOrganic":
      return "Organic";
    case "featured":
      return "Featured";
    case "minPrice": {
      const pence = parsePriceInput(value);
      return pence === undefined ? null : `From ${formatPricePence(pence)}`;
    }
    case "maxPrice": {
      const pence = parsePriceInput(value);
      return pence === undefined ? null : `Up to ${formatPricePence(pence)}`;
    }
    default:
      return value;
  }
}

/**
 * One chip per active filter. Each `href` is the current URL minus that one filter, preserving `q`
 * and every other active filter, and dropping pagination.
 *
 * `categoryLabel` is the resolved category NAME — the caller has already looked the category up to
 * build the predicate, so passing the name avoids a second query just to render a chip.
 */
export function activeFilterChips(
  basePath: string,
  params: FilterChipParams,
  categoryLabel?: string,
): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const key of REMOVABLE) {
    const value = params[key];
    if (!value) continue;
    const label = labelFor(key, value, categoryLabel);
    if (label === null) continue;
    chips.push({
      key,
      label,
      href: buildHref(basePath, params, [key, ...PAGINATION]),
    });
  }
  return chips;
}

/** Every filter dropped, `q` kept, pagination reset. */
export function clearAllHref(basePath: string, params: FilterChipParams): string {
  return buildHref(basePath, params, [...REMOVABLE, ...PAGINATION]);
}
