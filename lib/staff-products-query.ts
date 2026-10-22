/**
 * Turns the staff catalogue list's raw query string into repository filter
 * arguments (P7.5d+e, #169).
 *
 * Pure — no I/O, no Prisma, no repository import, exactly like the
 * lib/staff-orders-query.ts module this mirrors. That is what lets the whole
 * filter rule surface be unit-tested with no database.
 *
 * The non-obvious rule here is the INVERSE of the orders page's. `/staff/orders`
 * defaults to a narrowed worklist, so an absent or unrecognised status resolves
 * to the actionable queue. `/staff/products` has always listed EVERYTHING —
 * including items hidden from shoppers, deliberately, because an owner has to be
 * able to find the product they just switched off in order to switch it back on
 * (see the page's own comment). So here an absent or unrecognised status must
 * resolve to NO isActive filter at all. Anything else would silently change what
 * P6b1 shipped.
 */

/** The sentinel meaning "no isActive filter". Also the default. */
export const PRODUCT_STATUS_ALL = "all";

/**
 * The sentinel meaning "no category filter". Also the default (#503).
 *
 * Deliberately the same literal as PRODUCT_STATUS_ALL rather than a shared
 * constant: they are two independent filters that happen to spell their
 * "unfiltered" state the same way, and collapsing them would make a future
 * change to one silently change the other. Category ids are uuids, so no real
 * category can collide with it.
 */
export const CATEGORY_ALL = "all";

/** #1211 — "no restriction filter", and the two non-class selections. */
export const RESTRICTION_ALL = "all";
export const RESTRICTION_FILTERS = [
  "any",
  "none",
  "PROHIBITED",
  "AGE_RESTRICTED",
  "NOT_DELIVERABLE",
  "NEEDS_REVIEW",
] as const;
export type RestrictionFilter = (typeof RESTRICTION_FILTERS)[number];

/** #1211 — "no stock-mode filter". */
export const STOCK_ALL = "all";
export const STOCK_FILTERS = ["TRACKED", "UNTRACKED", "UNKNOWN"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

/** #1211 — the page sizes the list offers; anything else is the default. */
export const PER_PAGE_OPTIONS = [25, 100] as const;
export const DEFAULT_PER_PAGE = 25;

/**
 * The shape of a category this module needs to resolve a filter — an id and its
 * parent, nothing else.
 *
 * Structural, and narrower than `CategoryOption` in lib/catalogue-form.ts, so
 * both that type and the repository's `AdminCategoryRow` satisfy it without
 * either module importing the other. Requiring `name`/`isActive` here would
 * over-constrain callers for fields the parse rule never reads.
 */
export interface CategoryChoice {
  id: string;
  parentId: string | null;
}

export interface StaffProductsQuery {
  /**
   * The isActive value to filter on, or undefined for no filter.
   *
   * Deliberately `boolean | undefined` rather than a string the page has to
   * re-interpret: the repository takes this straight into a Prisma `where`, and
   * a three-state string there is exactly how a forged value gets a chance.
   */
  isActive: boolean | undefined;
  /** Trimmed search term, or null when absent or blank. */
  search: string | null;
  /**
   * The NORMALISED status selection, for re-rendering the filter control and
   * building the pagination href: `"all"`, `"active"` or `"inactive"`. Never the
   * raw input — echoing an unrecognised value into a link would carry the typo
   * to the next page, which is the bug lib/staff-orders-query.ts guards too.
   */
  status: string;
  /**
   * The NORMALISED category selection, for re-rendering the select and building
   * the pagination href: a real category id belonging to this vendor, or
   * CATEGORY_ALL. Never the raw input, for the same reason `status` isn't — and
   * here it matters more, because an unrecognised id is the shape a forged or
   * cross-vendor value arrives in.
   */
  category: string;
  /**
   * The category ids to filter on, or undefined for no filter.
   *
   * NEVER an empty array. `[]` in a Prisma `in` matches nothing, so a state
   * meaning "match nothing" would be reachable from a query string — which is
   * indistinguishable, on screen, from a working filter over an empty category.
   * Every path here yields either undefined or at least one id.
   */
  categoryIds: string[] | undefined;
  /** #1211 — the normalised restriction selection (`"all"` or one of RESTRICTION_FILTERS). */
  restrictionFilter: string;
  /** #1211 — the repository argument: undefined means no filter. */
  restriction: RestrictionFilter | undefined;
  /** #1211 — the normalised stock selection (`"all"` or one of STOCK_FILTERS). */
  stockFilter: string;
  stockMode: StockFilter | undefined;
  /** #1211 — 25 or 100; any other value is 25. */
  perPage: number;
}

/** A URL-encoded query string carrying the current filter, for the next-page link. */
export function staffProductsHref(query: StaffProductsQuery, cursor?: string | null): string {
  const params = new URLSearchParams();
  // `all` is the default, so it is omitted — a clean URL for the common case.
  if (query.status && query.status !== PRODUCT_STATUS_ALL) params.set("status", query.status);
  if (query.search) params.set("q", query.search);
  if (query.category && query.category !== CATEGORY_ALL) params.set("category", query.category);
  if (query.restriction) params.set("restriction", query.restriction);
  if (query.stockMode) params.set("stock", query.stockMode);
  if (query.perPage !== DEFAULT_PER_PAGE) params.set("perPage", String(query.perPage));
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `/staff/products?${qs}` : "/staff/products";
}

/**
 * @param categories every category belonging to the current vendor. REQUIRED,
 *   not optional-with-a-default: an omitted list would silently resolve every
 *   selection to CATEGORY_ALL, i.e. render a filter control that does nothing.
 *   Making the caller pass it turns "forgot the categories" into a compile
 *   error instead of a filter that quietly never fires.
 *
 *   Passing the vendor's OWN categories is also what scopes the filter: an id
 *   belonging to another vendor is simply not in this list, so it resolves to
 *   CATEGORY_ALL and the query never sees it.
 */
export function parseStaffProductsQuery(
  input: {
    status?: string;
    q?: string;
    category?: string;
    restriction?: string;
    stock?: string;
    perPage?: string;
  },
  categories: readonly CategoryChoice[],
): StaffProductsQuery {
  const rawStatus = (input.status ?? "").trim().toLowerCase();
  const rawSearch = (input.q ?? "").trim();
  const rawCategory = (input.category ?? "").trim();

  let status = PRODUCT_STATUS_ALL;
  let isActive: boolean | undefined;

  if (rawStatus === "active") {
    status = "active";
    isActive = true;
  } else if (rawStatus === "inactive") {
    status = "inactive";
    isActive = false;
  }
  // Anything else — absent, empty, "all", or unrecognised — keeps every product
  // visible and a normalised "all".

  // A selection only counts if it names a category this vendor actually has.
  // Absent, blank, "all", a typo, a stale bookmark or another vendor's id all
  // land in the same place: no filter.
  const selected = rawCategory === "" ? undefined : categories.find((c) => c.id === rawCategory);

  // A DEPARTMENT includes its subcategories; a SUBCATEGORY is exact.
  //
  // Both tiers are genuinely assignable and both are genuinely in use —
  // prisma/seed.ts puts hand-curated products directly on a top-level category
  // while seedGeneratedCatalogue puts generated ones on subcategories, and the
  // schema constrains neither (see toCategoryOptionGroups' docstring). So an
  // exact-match department filter would show the curated products and hide
  // every generated one beneath it, which reads as a broken filter rather than
  // a narrow one.
  //
  // One level deep is the whole hierarchy: Category's parent/child self-relation
  // is capped at two tiers, so a child never has children of its own. That also
  // makes the orphan case (a child whose parent is absent from this list) safe
  // to treat as exact — it can have no descendants to miss.
  const categoryIds =
    selected === undefined
      ? undefined
      : selected.parentId === null
        ? [selected.id, ...categories.filter((c) => c.parentId === selected.id).map((c) => c.id)]
        : [selected.id];

  // #1211 — exact matches only; a typo or a forged value is no filter, like status above.
  const rawRestriction = (input.restriction ?? "").trim();
  const restriction = (RESTRICTION_FILTERS as readonly string[]).includes(rawRestriction)
    ? (rawRestriction as RestrictionFilter)
    : undefined;
  const rawStock = (input.stock ?? "").trim();
  const stockMode = (STOCK_FILTERS as readonly string[]).includes(rawStock)
    ? (rawStock as StockFilter)
    : undefined;
  const rawPerPage = Number((input.perPage ?? "").trim());
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(rawPerPage)
    ? rawPerPage
    : DEFAULT_PER_PAGE;

  return {
    isActive,
    search: rawSearch === "" ? null : rawSearch,
    status,
    category: selected?.id ?? CATEGORY_ALL,
    categoryIds,
    restrictionFilter: restriction ?? RESTRICTION_ALL,
    restriction,
    stockFilter: stockMode ?? STOCK_ALL,
    stockMode,
    perPage,
  };
}
