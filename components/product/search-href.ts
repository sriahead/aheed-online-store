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
 *
 * #601/#912 — WHICH keys are carried is no longer decided here. `filterEntries` in
 * `filter-params.ts` is the single definition, shared with the chips and the category page, and it
 * is the only thing that can carry a vendor-defined `attr_*` filter, whose key no list could hold.
 */
import { FIXED_FILTER_KEYS, filterEntries, type FilterParamValue } from "./filter-params";

export type SearchHrefParams = {
  /** #912/#918 — a vendor-defined filter (list or range key); see filter-params.ts. */
  [attributeKey: `attr_${string}`]: FilterParamValue;
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
  packSize?: string;
};

/**
 * The fixed keys a "Next page" link carries: the query plus every fixed filter key. DERIVED, not
 * listed (#601) — kept as an export only because `tests/filter-chips.test.ts` still pins it against
 * `REMOVABLE`. `attr_*` keys are carried too, by rule, and so cannot appear here.
 */
export const CARRIED: readonly string[] = ["q", ...FIXED_FILTER_KEYS];

/** `q` first, then every filter `filterEntries` carries, minus `omit`. */
function carriedQuery(params: SearchHrefParams, omit: readonly string[] = []): URLSearchParams {
  const qs = new URLSearchParams();
  if (typeof params.q === "string" && params.q !== "") qs.set("q", params.q);
  // `append`, never `set` (#918): a list filter may carry several values under one key.
  for (const [key, value] of filterEntries(params, omit)) qs.append(key, value);
  return qs;
}

export function searchPageHref(params: SearchHrefParams, cursor: string): string {
  const qs = carriedQuery(params);
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
  const qs = carriedQuery(params, ["category"]);
  qs.set("category", categorySlug);
  return `/search?${qs.toString()}`;
}
