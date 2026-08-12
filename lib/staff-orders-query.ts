import {
  ORDER_STATUSES,
  STAFF_QUEUE_STATUSES,
  isOrderStatus,
  type OrderStatusValue,
} from "@/lib/order-status";

/**
 * Turns the staff dashboard's raw query string into repository filter arguments
 * (P6a, #158).
 *
 * Pure — no I/O, no Prisma, no repository import (that is what lets the whole
 * filter/search rule surface be unit-tested with no database, the same split as
 * lib/order-status.ts, lib/cart-rules.ts and lib/shopping-list.ts).
 *
 * The one non-obvious rule: an ABSENT or UNRECOGNISED `status` both resolve to
 * P4b's actionable queue, not to "everything". `/staff/orders` with no query
 * string must keep behaving exactly as it did when it shipped — a packer's
 * worklist — and a typo'd or forged value must not silently widen it either.
 * Seeing the rest of the order history is an explicit act: ?status=all.
 */

/** The sentinel that widens the list to every status. Not an OrderStatus. */
export const STATUS_ALL = "all";

export interface StaffOrdersQuery {
  /**
   * Statuses to filter on. Never empty.
   *
   * Typed as the OrderStatus union, not `string[]`: `ORDER_STATUSES` is
   * structurally identical to Prisma's generated enum, so this flows straight
   * into a Prisma `where` with no cast — and a cast is exactly what would let a
   * forged status through to the query one day.
   */
  statuses: readonly OrderStatusValue[];
  /** Trimmed search term, or null when absent or blank. */
  search: string | null;
  /**
   * The NORMALISED status selection, for re-rendering the filter control and
   * for building the pagination href: `""` for the default queue, `"all"`, or a
   * single OrderStatus. Never the raw input — echoing an unrecognised value into
   * a link would carry the typo to the next page.
   */
  status: string;
}

/** A URL-encoded query string carrying the current filter, for the next-page link. */
export function staffOrdersHref(query: StaffOrdersQuery, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.search) params.set("q", query.search);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `/staff/orders?${qs}` : "/staff/orders";
}

export function parseStaffOrdersQuery(input: { status?: string; q?: string }): StaffOrdersQuery {
  const rawStatus = (input.status ?? "").trim();
  const rawSearch = (input.q ?? "").trim();

  let status = "";
  let statuses: readonly OrderStatusValue[] = STAFF_QUEUE_STATUSES;

  if (rawStatus === STATUS_ALL) {
    status = STATUS_ALL;
    statuses = ORDER_STATUSES;
  } else if (isOrderStatus(rawStatus)) {
    status = rawStatus;
    statuses = [rawStatus];
  }
  // Anything else — absent, empty, or unrecognised — keeps the default queue
  // and a normalised empty `status`.

  return {
    statuses,
    search: rawSearch === "" ? null : rawSearch,
    status,
  };
}
