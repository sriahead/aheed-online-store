import { describe, expect, it } from "vitest";
import {
  PRODUCT_STATUS_ALL,
  parseStaffProductsQuery,
  staffProductsHref,
} from "@/lib/staff-products-query";

/**
 * P7.5d+e (#169) — the staff catalogue list's filter rules, unit-tested with no
 * database.
 *
 * The rule worth protecting here is the INVERSE of the orders page's. P6b1
 * deliberately shipped /staff/products showing everything, hidden items
 * included, because an owner has to be able to find the product they just
 * switched off in order to switch it back on. So an absent or unrecognised
 * status must resolve to NO isActive filter — narrowing that default by accident
 * is the failure this file exists to catch.
 */
describe("parseStaffProductsQuery", () => {
  it("applies no isActive filter when nothing is supplied", () => {
    const query = parseStaffProductsQuery({});
    expect(query.isActive).toBeUndefined();
    expect(query.search).toBeNull();
    expect(query.status).toBe(PRODUCT_STATUS_ALL);
  });

  it("applies no isActive filter for an unrecognised status", () => {
    const query = parseStaffProductsQuery({ status: "BANANA" });
    expect(query.isActive).toBeUndefined();
    // Normalised, NOT echoed: carrying "BANANA" into the next-page link would
    // propagate the typo through pagination.
    expect(query.status).toBe(PRODUCT_STATUS_ALL);
  });

  it("does not narrow the catalogue for an empty or whitespace status", () => {
    for (const status of ["", "   "]) {
      const query = parseStaffProductsQuery({ status });
      expect(query.isActive).toBeUndefined();
      expect(query.status).toBe(PRODUCT_STATUS_ALL);
    }
  });

  it("filters to visible products for status=active", () => {
    const query = parseStaffProductsQuery({ status: "active" });
    expect(query.isActive).toBe(true);
    expect(query.status).toBe("active");
  });

  it("filters to hidden products for status=inactive", () => {
    const query = parseStaffProductsQuery({ status: "inactive" });
    expect(query.isActive).toBe(false);
    expect(query.status).toBe("inactive");
  });

  it("accepts a status regardless of case", () => {
    expect(parseStaffProductsQuery({ status: "ACTIVE" }).isActive).toBe(true);
    expect(parseStaffProductsQuery({ status: "InActive" }).isActive).toBe(false);
  });

  it("trims the search term and treats a blank one as absent", () => {
    expect(parseStaffProductsQuery({ q: "  rice  " }).search).toBe("rice");
    expect(parseStaffProductsQuery({ q: "   " }).search).toBeNull();
    expect(parseStaffProductsQuery({ q: "" }).search).toBeNull();
  });
});

describe("staffProductsHref", () => {
  it("returns the bare path when nothing is filtered", () => {
    expect(staffProductsHref(parseStaffProductsQuery({}))).toBe("/staff/products");
  });

  it("omits the default status so the common URL stays clean", () => {
    const href = staffProductsHref(parseStaffProductsQuery({ status: PRODUCT_STATUS_ALL }), "abc");
    expect(href).toBe("/staff/products?cursor=abc");
  });

  it("carries the active filter and search into the next-page link", () => {
    const query = parseStaffProductsQuery({ status: "inactive", q: "basmati rice" });
    const href = staffProductsHref(query, "cur123");
    expect(href).toContain("status=inactive");
    expect(href).toContain("q=basmati+rice");
    expect(href).toContain("cursor=cur123");
  });

  it("encodes a search term that would otherwise break the query string", () => {
    const query = parseStaffProductsQuery({ q: "a&b=c" });
    expect(staffProductsHref(query)).toBe("/staff/products?q=a%26b%3Dc");
  });

  it("omits the cursor when there is no next page", () => {
    const query = parseStaffProductsQuery({ q: "rice" });
    expect(staffProductsHref(query, null)).toBe("/staff/products?q=rice");
  });
});
