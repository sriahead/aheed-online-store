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
}

/** A URL-encoded query string carrying the current filter, for the next-page link. */
export function staffProductsHref(query: StaffProductsQuery, cursor?: string | null): string {
  const params = new URLSearchParams();
  // `all` is the default, so it is omitted — a clean URL for the common case.
  if (query.status && query.status !== PRODUCT_STATUS_ALL) params.set("status", query.status);
  if (query.search) params.set("q", query.search);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `/staff/products?${qs}` : "/staff/products";
}

export function parseStaffProductsQuery(input: {
  status?: string;
  q?: string;
}): StaffProductsQuery {
  const rawStatus = (input.status ?? "").trim().toLowerCase();
  const rawSearch = (input.q ?? "").trim();

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

  return {
    isActive,
    search: rawSearch === "" ? null : rawSearch,
    status,
  };
}
