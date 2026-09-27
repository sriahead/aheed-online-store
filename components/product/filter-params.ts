/**
 * THE one definition of "what is a storefront filter key" (#601, folded into #912).
 *
 * Before this module a filter key had to be registered in three unsynchronised places:
 * `filter-chips.ts`'s `REMOVABLE`, `search-href.ts`'s `CARRIED`, and a hand-written
 * `if (params.X) qs.set(...)` chain inside `app/(storefront)/categories/[slug]/page.tsx`. Omitting a
 * key from either of the last two dropped the filter one click into "Next page", leaving the
 * shopper on a wider result set than the chips still claimed. That shipped twice (#501, #568).
 *
 * #912 made the lists impossible to maintain by hand at all: a vendor invents its own filters at
 * runtime, so their keys (`attr_<attributeSlug>`) cannot be written into any list. This module
 * therefore holds the FIXED keys plus the RULE for attribute keys, and every href builder and the
 * chip module derive from it. A new fixed filter is added here and nowhere else.
 *
 * Pure: no Prisma, no request context, so tests import it directly.
 */

/**
 * Every fixed filter key, in the order chips render. `q`, `cursor` and `back` are deliberately
 * absent: the first is the search itself, not a filter, and the other two are pagination.
 */
export const FIXED_FILTER_KEYS = [
  "category",
  "brand",
  "origin",
  "packSize",
  "inStock",
  "onOffer",
  "isHalal",
  "isFresh",
  "isOrganic",
  "isVegetarian",
  "isGlutenFree",
  "isHmcCertified",
  "featured",
  "minPrice",
  "maxPrice",
] as const;

export type FixedFilterKey = (typeof FIXED_FILTER_KEYS)[number];

/** #912 — a vendor filter travels as `attr_<attributeSlug>=<optionSlug>`. */
export const ATTRIBUTE_PARAM_PREFIX = "attr_";

/**
 * The slug half matches what `slugify` (lib/catalogue-form.ts) can produce. Anything else — an
 * uppercase letter, punctuation — cannot name a real attribute, so it is not carried at all rather
 * than propagated through every link on the page.
 */
const ATTRIBUTE_PARAM_KEY = /^attr_[a-z0-9-]+$/;

export function isAttributeParamKey(key: string): boolean {
  return ATTRIBUTE_PARAM_KEY.test(key);
}

/**
 * A page's raw query parameters. A value can arrive as an ARRAY at runtime whatever a page's own
 * type says (a repeated parameter, #689), which is why the value type admits one.
 */
export type FilterParamValue = string | string[] | undefined;
export type FilterParams = { readonly [key: string]: FilterParamValue };

/**
 * The filter parameters to carry into a link, as ordered `[key, value]` pairs: the fixed keys in
 * `FIXED_FILTER_KEYS` order, then attribute keys sorted by key (a stable order, so the same filter
 * state always produces the same URL).
 *
 * Skipped: any key in `omit`; any value that is empty or not a string (a repeated parameter applies
 * no predicate anywhere on the page, so carrying it forward would only spread a no-op); and any key
 * that is neither a fixed key nor a well-formed attribute key.
 */
export function filterEntries(
  params: FilterParams,
  omit: readonly string[] = [],
): [string, string][] {
  const entries: [string, string][] = [];
  for (const key of FIXED_FILTER_KEYS) {
    if (omit.includes(key)) continue;
    const value = params[key];
    if (typeof value === "string" && value !== "") entries.push([key, value]);
  }
  const attributeKeys = Object.keys(params)
    .filter((key) => isAttributeParamKey(key) && !omit.includes(key))
    .sort();
  for (const key of attributeKeys) {
    const value = params[key];
    if (typeof value === "string" && value !== "") entries.push([key, value]);
  }
  return entries;
}
