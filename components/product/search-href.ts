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
  featured?: string;
};

const CARRIED: (keyof SearchHrefParams)[] = [
  "q",
  "minPrice",
  "maxPrice",
  "inStock",
  "isHalal",
  "isFresh",
  "isOrganic",
  "featured",
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
