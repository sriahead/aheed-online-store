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

/**
 * #912 — a LIST vendor filter travels as `attr_<attributeSlug>=<optionSlug>`, and (#918) may repeat
 * (`attr_colour=black&attr_colour=white`, either value). A NUMBER filter travels as
 * `attr_<attributeSlug>_min` / `_max`; a slug is `[a-z0-9-]`, so the underscore suffix cannot
 * collide with one.
 */
export const ATTRIBUTE_PARAM_PREFIX = "attr_";

/**
 * The slug half matches what `slugify` (lib/catalogue-form.ts) can produce. Anything else — an
 * uppercase letter, punctuation — cannot name a real attribute, so it is not carried at all rather
 * than propagated through every link on the page.
 */
const ATTRIBUTE_LIST_PARAM_KEY = /^attr_([a-z0-9-]+)$/;
const ATTRIBUTE_RANGE_PARAM_KEY = /^attr_([a-z0-9-]+)_(min|max)$/;

/** A list key or a range key. */
export function isAttributeParamKey(key: string): boolean {
  return ATTRIBUTE_LIST_PARAM_KEY.test(key) || ATTRIBUTE_RANGE_PARAM_KEY.test(key);
}

/** #918 — a LIST filter key, the only kind whose value may be an array (a repeated parameter). */
export function isAttributeListParamKey(key: string): boolean {
  return ATTRIBUTE_LIST_PARAM_KEY.test(key);
}

/** #918 — `attr_power_min` → `{ slug: "power", bound: "min" }`; anything else → `null`. */
export function parseAttributeRangeParamKey(
  key: string,
): { slug: string; bound: "min" | "max" } | null {
  const match = ATTRIBUTE_RANGE_PARAM_KEY.exec(key);
  return match ? { slug: match[1], bound: match[2] as "min" | "max" } : null;
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
 * state always produces the same URL). A caller builds its query with `append`, never `set`, since
 * one list key can yield several pairs.
 *
 * Skipped: any key in `omit`; any key that is neither a fixed key nor a well-formed attribute key;
 * and any value that is empty or not a string — a repeated FIXED or RANGE parameter applies no
 * predicate anywhere on the page (#689), so carrying it forward would only spread a no-op.
 *
 * #918 — the one exception: a LIST attribute key's array IS its meaning (ticked checkboxes submit
 * the key once per value), so it yields one pair per distinct non-empty value, in the order given.
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
    for (const value of attributeParamValues(key, params[key])) entries.push([key, value]);
  }
  return entries;
}

/**
 * #918 — the values one attribute key carries: a list key's distinct non-empty strings (array or
 * single), or a range key's single non-empty string. Shared with `lib/attribute-filters.ts` so the
 * predicate, the chips and every link read a key's values identically.
 */
export function attributeParamValues(key: string, value: FilterParamValue): string[] {
  if (typeof value === "string") return value === "" ? [] : [value];
  if (!Array.isArray(value) || !isAttributeListParamKey(key)) return [];
  return [...new Set(value.filter((item) => typeof item === "string" && item !== ""))];
}
