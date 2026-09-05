/**
 * Pure, unit-tested. Builds the `/search` href for the next keyset page,
 * carrying every active filter across the page boundary.
 *
 * Extracted from `app/(storefront)/search/page.tsx` in #501: the page now has
 * two modes (browse and search) and a `featured` param, and a param silently
 * dropped here strands the shopper on an unfiltered listing one click into
 * pagination. A page file can't export a helper for a test to import — Next
 * only permits its own known exports — so this lives beside the components that
 * use it, matching `parse-price-input.ts`.
 *
 * `cursor` is set from the argument, never carried over from `params`: the
 * caller always knows the cursor for the page it is linking to.
 */
export type SearchHrefParams = {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  isHalal?: string;
  isFresh?: string;
  isOrganic?: string;
  isVegetarian?: string;
  isGlutenFree?: string;
  isHmcCertified?: string;
  onOffer?: string;
  origin?: string;
  brand?: string;
  featured?: string;
  category?: string;
};

export const CARRIED: (keyof SearchHrefParams)[] = [
  "q",
  "minPrice",
  "maxPrice",
  "inStock",
  "isHalal",
  "isFresh",
  "isOrganic",
  // #569 — six new facets. Each MUST be here: this list is what survives a "Next page" click, and
  // a key present in the chips but missing here is dropped one click into pagination, leaving the
  // shopper on a wider result set than the chips claim. Exactly the bug #501 fixed for `featured`
  // and #568 for `category`. `tests/filter-chips.test.ts` pins this list against REMOVABLE.
  "isVegetarian",
  "isGlutenFree",
  "isHmcCertified",
  "onOffer",
  "origin",
  "brand",
  "featured",
  // #568 — category drill-down is a filter like any other here, so it must survive pagination for
  // the same reason every key above does: dropping it one click into "Next page" silently widens
  // the result set back to the whole catalogue.
  "category",
];

export function searchPageHref(params: SearchHrefParams, cursor: string): string {
  const qs = new URLSearchParams();
  for (const key of CARRIED) {
    const value = params[key];
    if (value) qs.set(key, value);
  }
  qs.set("cursor", cursor);
  return `/search?${qs.toString()}`;
}

/**
 * #568 — the href for selecting a department from within results: every active filter and the
 * shopper's query are preserved, `category` is replaced, and `cursor` is dropped.
 *
 * Dropping the cursor is not optional. It is an OFFSET into a ranked array (see
 * `parseSearchOffset`), so carrying it into a differently-sized result set would land the shopper
 * at an arbitrary point in the new results, or past the end of them.
 */
export function categoryFilterHref(params: SearchHrefParams, categorySlug: string): string {
  const qs = new URLSearchParams();
  for (const key of CARRIED) {
    if (key === "category") continue;
    const value = params[key];
    if (value) qs.set(key, value);
  }
  qs.set("category", categorySlug);
  return `/search?${qs.toString()}`;
}
