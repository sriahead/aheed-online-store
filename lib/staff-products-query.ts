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

/**
 * #1211 — the page sizes the list offers; anything else is the default. #1523 added 50. There is
 * deliberately no "All" (owner decision 2026-11-11): the catalogue is thousands of products deep,
 * and one page of all of them is a multi-megabyte render on a phone.
 */
export const PER_PAGE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PER_PAGE = 25;

/**
 * #1523 — list order. `newest` is the default and is the order the list always had
 * (`createdAt desc, id desc`), so an absent or unknown value changes nothing.
 */
export const SORT_OPTIONS = ["newest", "name", "price-asc", "price-desc"] as const;
export type StaffProductsSort = (typeof SORT_OPTIONS)[number];
export const DEFAULT_SORT: StaffProductsSort = "newest";
export const SORT_LABELS: Record<StaffProductsSort, string> = {
  newest: "Newest first",
  name: "Name A–Z",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
};

/**
 * #1523 — "needs attention" worklists: the next job, one click away. `price` = priced at £0 (cannot
 * be switched on); `ready` = hidden, priced and unrestricted (could be switched on now); `image` =
 * no photo.
 */
export const NEEDS_ALL = "all";
export const NEEDS_FILTERS = ["price", "ready", "image"] as const;
export type NeedsFilter = (typeof NEEDS_FILTERS)[number];
export const NEEDS_LABELS: Record<NeedsFilter, string> = {
  price: "Price needed (£0)",
  ready: "Ready to switch on",
  image: "No photo",
};

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
  /** #1211/#1523 — one of PER_PAGE_OPTIONS; any other value is 25. */
  perPage: number;
  /** #1523 — the normalised sort (always one of SORT_OPTIONS). */
  sort: StaffProductsSort;
  /** #1523 — the normalised needs selection (`"all"` or one of NEEDS_FILTERS). */
  needsFilter: string;
  /** #1523 — the repository argument: undefined means no filter. */
  needs: NeedsFilter | undefined;
  /**
   * #1523 — the REQUESTED 1-based page: a positive integer, else 1. Not clamped to the last page
   * here, because the page count is only known after the count query — see clampPage().
   */
  page: number;
}

/**
 * A URL-encoded query string carrying the current filter, for a pagination link. #1523 — a page
 * NUMBER replaced #1211's keyset cursor, so a link can name any page, not only the next one.
 * Page 1 is the default and is omitted.
 */
export function staffProductsHref(query: StaffProductsQuery, page?: number | null): string {
  const params = new URLSearchParams();
  // `all` is the default, so it is omitted — a clean URL for the common case.
  if (query.status && query.status !== PRODUCT_STATUS_ALL) params.set("status", query.status);
  if (query.search) params.set("q", query.search);
  if (query.category && query.category !== CATEGORY_ALL) params.set("category", query.category);
  if (query.restriction) params.set("restriction", query.restriction);
  if (query.stockMode) params.set("stock", query.stockMode);
  if (query.perPage !== DEFAULT_PER_PAGE) params.set("perPage", String(query.perPage));
  if (query.sort !== DEFAULT_SORT) params.set("sort", query.sort);
  if (query.needs) params.set("needs", query.needs);
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/staff/products?${qs}` : "/staff/products";
}

/**
 * The active filters as name/value pairs: exactly the parameters `staffProductsHref` writes, without
 * `page`. The jump-to-page box sends them as hidden fields, and deriving them from the href means
 * the two can never disagree about which filters a page carries.
 */
export function staffProductsFilterFields(query: StaffProductsQuery): [string, string][] {
  const qs = staffProductsHref(query).split("?")[1] ?? "";
  return [...new URLSearchParams(qs).entries()];
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
    sort?: string;
    needs?: string;
    page?: string;
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

  // #1523 — exact matches only, like every filter above.
  const rawSort = (input.sort ?? "").trim();
  const sort = (SORT_OPTIONS as readonly string[]).includes(rawSort)
    ? (rawSort as StaffProductsSort)
    : DEFAULT_SORT;
  const rawNeeds = (input.needs ?? "").trim();
  const needs = (NEEDS_FILTERS as readonly string[]).includes(rawNeeds)
    ? (rawNeeds as NeedsFilter)
    : undefined;
  // Digits only: "2abc", "1.5", "-3" and "1e3" are all page 1, not a parseInt guess.
  const rawPage = (input.page ?? "").trim();
  const page = /^[0-9]{1,6}$/.test(rawPage) && Number(rawPage) >= 1 ? Number(rawPage) : 1;

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
    sort,
    needsFilter: needs ?? NEEDS_ALL,
    needs,
    page,
  };
}

/** #1523 — the number of pages for `total` items; at least 1, so an empty list is "Page 1 of 1". */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** #1523 — a requested page clamped into [1, pages]: a stale "page 40" link lands on the last page. */
export function clampPage(requested: number, pages: number): number {
  return Math.min(Math.max(1, requested), Math.max(1, pages));
}

/** #1523 — moved to `lib/pagination.ts`, shared by every pagination bar; re-exported here. */
export { pageWindow } from "@/lib/pagination";
