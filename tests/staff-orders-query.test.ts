import { describe, expect, it } from "vitest";
import { ORDER_STATUSES, STAFF_QUEUE_STATUSES } from "@/lib/order-status";
import { STATUS_ALL, parseStaffOrdersQuery, staffOrdersHref } from "@/lib/staff-orders-query";

/**
 * P6a (#158) — the staff dashboard's filter rules, unit-tested with no database.
 *
 * The rule worth protecting here is the fallback: an absent OR unrecognised
 * status must resolve to P4b's actionable queue, never to "everything". Widening
 * the packing floor's default view by accident is the failure this file exists
 * to catch.
 */
describe("parseStaffOrdersQuery", () => {
  it("defaults to the actionable queue when nothing is supplied", () => {
    const query = parseStaffOrdersQuery({});
    expect(query.statuses).toEqual(STAFF_QUEUE_STATUSES);
    expect(query.search).toBeNull();
    expect(query.status).toBe("");
  });

  it("falls back to the actionable queue for an unrecognised status", () => {
    const query = parseStaffOrdersQuery({ status: "BANANA" });
    expect(query.statuses).toEqual(STAFF_QUEUE_STATUSES);
    // Normalised, NOT echoed: carrying "BANANA" into the next-page link would
    // propagate the typo through pagination.
    expect(query.status).toBe("");
  });

  it("does not widen to every status for an empty or whitespace status", () => {
    for (const status of ["", "   "]) {
      expect(parseStaffOrdersQuery({ status }).statuses).toEqual(STAFF_QUEUE_STATUSES);
    }
  });

  it("widens to every status for the 'all' sentinel", () => {
    const query = parseStaffOrdersQuery({ status: STATUS_ALL });
    expect(query.statuses).toEqual(ORDER_STATUSES);
    expect(query.status).toBe(STATUS_ALL);
  });

  it("narrows to exactly one status for each real OrderStatus", () => {
    for (const status of ORDER_STATUSES) {
      const query = parseStaffOrdersQuery({ status });
      expect(query.statuses).toEqual([status]);
      expect(query.status).toBe(status);
    }
  });

  it("is case-sensitive about status values, falling back rather than guessing", () => {
    expect(parseStaffOrdersQuery({ status: "delivered" }).statuses).toEqual(STAFF_QUEUE_STATUSES);
  });

  it("trims the search term and treats blank as absent", () => {
    expect(parseStaffOrdersQuery({ q: "  AHD-123  " }).search).toBe("AHD-123");
    expect(parseStaffOrdersQuery({ q: "" }).search).toBeNull();
    expect(parseStaffOrdersQuery({ q: "   " }).search).toBeNull();
  });

  it("keeps status and search independent", () => {
    const query = parseStaffOrdersQuery({ status: "DELIVERED", q: "sam@example.com" });
    expect(query.statuses).toEqual(["DELIVERED"]);
    expect(query.search).toBe("sam@example.com");
  });
});

describe("staffOrdersHref", () => {
  it("omits every parameter for the default, unsearched queue", () => {
    expect(staffOrdersHref(parseStaffOrdersQuery({}))).toBe("/staff/orders");
  });

  it("carries the active status and search alongside the cursor", () => {
    const query = parseStaffOrdersQuery({ status: STATUS_ALL, q: "sam@example.com" });
    const href = staffOrdersHref(query, "cursor-id");
    expect(href).toContain("status=all");
    expect(href).toContain("q=sam%40example.com");
    expect(href).toContain("cursor=cursor-id");
  });

  it("does not carry a normalised-away status into the next page", () => {
    const href = staffOrdersHref(parseStaffOrdersQuery({ status: "BANANA" }), "cursor-id");
    expect(href).not.toContain("status=");
    expect(href).toContain("cursor=cursor-id");
  });

  it("url-encodes a search term with reserved characters", () => {
    const query = parseStaffOrdersQuery({ q: "a&b c" });
    expect(staffOrdersHref(query)).toBe("/staff/orders?q=a%26b+c");
  });
});
