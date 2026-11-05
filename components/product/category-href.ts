/**
 * Previous/Next page hrefs for `/categories/[slug]` (#498), moved out of the page module by #601.
 *
 * WHY THIS FILE EXISTS. The page used to build these with a hand-written `if (params.X)
 * qs.set(...)` chain — the THIRD place a filter key had to be registered, and the one no test could
 * reach, because a Next page file may export only its own known symbols. Omitting a key there
 * silently dropped that filter on "Next page" (`packSize` shipped that way and was caught only at a
 * live `/validate`). The keys now come from `filterEntries` (`filter-params.ts`), the one definition
 * shared with `/search` and the chips, and the builders live here where `tests/filter-params.test.ts`
 * can import them.
 *
 * One consequence, accepted in #912's plan: this page now carries EVERY fixed filter key, so a
 * stray `featured` or `category` in a category URL survives pagination. The page reads neither, so
 * the listing is unchanged.
 */
import { filterEntries, type FilterParams } from "./filter-params";

export type CategoryPageParams = FilterParams & {
  cursor?: string;
  /**
   * #498 — the stack of cursors used to reach every PRIOR page, comma-joined, so "Previous" can
   * navigate backwards without an OFFSET query (keyset-only pagination, per specs/architecture.md)
   * or a separate COUNT query. Page 1 in the stack is an empty segment (no cursor reached it).
   */
  back?: string;
};

function parseBack(back: unknown): string[] {
  return typeof back === "string" && back !== "" ? back.split(",") : [];
}

function categoryPageHref(
  slug: string,
  params: CategoryPageParams,
  overrides: { cursor?: string; back: string[] },
): string {
  const qs = new URLSearchParams();
  if (typeof params.sort === "string" && params.sort !== "") {
    qs.set("sort", params.sort);
  }
  // `append`, never `set` (#918): a list filter may carry several values under one key.
  for (const [key, value] of filterEntries(params)) qs.append(key, value);
  if (overrides.cursor) qs.set("cursor", overrides.cursor);
  // A lone "" entry means "page 1 had no cursor" and nothing else — not worth a query param at
  // all, so the very first "Next" click stays a clean URL.
  const joinedBack = overrides.back.join(",");
  if (joinedBack !== "") qs.set("back", joinedBack);
  return `/categories/${slug}?${qs.toString()}`;
}

export function nextCategoryPageHref(
  slug: string,
  params: CategoryPageParams,
  nextCursor: string,
): string {
  const cursor = typeof params.cursor === "string" ? params.cursor : "";
  const back = [...parseBack(params.back), cursor];
  return categoryPageHref(slug, params, { cursor: nextCursor, back });
}

export function prevCategoryPageHref(slug: string, params: CategoryPageParams): string {
  const back = parseBack(params.back);
  const prevCursor = back[back.length - 1] ?? "";
  return categoryPageHref(slug, params, {
    cursor: prevCursor || undefined,
    back: back.slice(0, -1),
  });
}

/**
 * Returns the query string of active filters and sort orders to preserve when switching categories.
 */
export function categoryNavQuery(params: CategoryPageParams): string {
  const qs = new URLSearchParams();
  if (typeof params.sort === "string" && params.sort !== "") {
    qs.set("sort", params.sort);
  }
  // Carry all active filters, omitting pagination keys:
  for (const [key, value] of filterEntries(params, ["cursor", "back"])) {
    qs.append(key, value);
  }
  return qs.toString();
}

/**
 * Builds the URL when navigating to a new category or subcategory from within a category view.
 * Carries all active filters (dietary, price, stock, brand, vendor attributes) and sort order
 * across the category switch, while dropping cursor and back so the new category starts at page 1.
 */
export function categoryNavHref(newSlug: string, params: CategoryPageParams): string {
  const query = categoryNavQuery(params);
  return query ? `/categories/${newSlug}?${query}` : `/categories/${newSlug}`;
}
