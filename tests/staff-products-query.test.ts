import { describe, expect, it } from "vitest";
import {
  CATEGORY_ALL,
  PRODUCT_STATUS_ALL,
  type CategoryChoice,
  parseStaffProductsQuery,
  staffProductsHref,
} from "@/lib/staff-products-query";

/**
 * P7.5d+e (#169) and #503 — the staff catalogue list's filter rules, unit-tested
 * with no database.
 *
 * The rule worth protecting here is the INVERSE of the orders page's. P6b1
 * deliberately shipped /staff/products showing everything, hidden items
 * included, because an owner has to be able to find the product they just
 * switched off in order to switch it back on. So an absent or unrecognised
 * status must resolve to NO isActive filter — narrowing that default by accident
 * is the failure this file exists to catch.
 *
 * #503 adds the category filter under the same discipline: the whole rule
 * surface — which ids a selection expands to, and what an unrecognised one does
 * — is decided by a pure function taking the vendor's categories as data, so it
 * is provable here rather than only against a live catalogue.
 */

/**
 * A two-tier fixture covering every shape the parser has to distinguish:
 * a department WITH children, a department WITHOUT children (the case that must
 * yield [id] rather than []), and an orphan child whose parent is absent.
 */
const GRAINS: CategoryChoice = { id: "cat-grains", parentId: null };
const RICE: CategoryChoice = { id: "cat-rice", parentId: "cat-grains" };
const FLOUR: CategoryChoice = { id: "cat-flour", parentId: "cat-grains" };
const DRINKS: CategoryChoice = { id: "cat-drinks", parentId: null };
const ORPHAN: CategoryChoice = { id: "cat-orphan", parentId: "cat-vanished" };

const CATEGORIES: CategoryChoice[] = [GRAINS, RICE, FLOUR, DRINKS, ORPHAN];

describe("parseStaffProductsQuery", () => {
  it("applies no isActive filter when nothing is supplied", () => {
    const query = parseStaffProductsQuery({}, CATEGORIES);
    expect(query.isActive).toBeUndefined();
    expect(query.search).toBeNull();
    expect(query.status).toBe(PRODUCT_STATUS_ALL);
  });

  it("applies no isActive filter for an unrecognised status", () => {
    const query = parseStaffProductsQuery({ status: "BANANA" }, CATEGORIES);
    expect(query.isActive).toBeUndefined();
    // Normalised, NOT echoed: carrying "BANANA" into the next-page link would
    // propagate the typo through pagination.
    expect(query.status).toBe(PRODUCT_STATUS_ALL);
  });

  it("does not narrow the catalogue for an empty or whitespace status", () => {
    for (const status of ["", "   "]) {
      const query = parseStaffProductsQuery({ status }, CATEGORIES);
      expect(query.isActive).toBeUndefined();
      expect(query.status).toBe(PRODUCT_STATUS_ALL);
    }
  });

  it("filters to visible products for status=active", () => {
    const query = parseStaffProductsQuery({ status: "active" }, CATEGORIES);
    expect(query.isActive).toBe(true);
    expect(query.status).toBe("active");
  });

  it("filters to hidden products for status=inactive", () => {
    const query = parseStaffProductsQuery({ status: "inactive" }, CATEGORIES);
    expect(query.isActive).toBe(false);
    expect(query.status).toBe("inactive");
  });

  it("accepts a status regardless of case", () => {
    expect(parseStaffProductsQuery({ status: "ACTIVE" }, CATEGORIES).isActive).toBe(true);
    expect(parseStaffProductsQuery({ status: "InActive" }, CATEGORIES).isActive).toBe(false);
  });

  it("trims the search term and treats a blank one as absent", () => {
    expect(parseStaffProductsQuery({ q: "  rice  " }, CATEGORIES).search).toBe("rice");
    expect(parseStaffProductsQuery({ q: "   " }, CATEGORIES).search).toBeNull();
    expect(parseStaffProductsQuery({ q: "" }, CATEGORIES).search).toBeNull();
  });
});

describe("parseStaffProductsQuery — category (#503)", () => {
  it("applies no category filter when nothing is supplied", () => {
    const query = parseStaffProductsQuery({}, CATEGORIES);
    expect(query.category).toBe(CATEGORY_ALL);
    expect(query.categoryIds).toBeUndefined();
  });

  it("applies no category filter for an empty or whitespace value", () => {
    for (const category of ["", "   "]) {
      const query = parseStaffProductsQuery({ category }, CATEGORIES);
      expect(query.category).toBe(CATEGORY_ALL);
      expect(query.categoryIds).toBeUndefined();
    }
  });

  it("applies no category filter for the explicit `all` sentinel", () => {
    const query = parseStaffProductsQuery({ category: CATEGORY_ALL }, CATEGORIES);
    expect(query.category).toBe(CATEGORY_ALL);
    expect(query.categoryIds).toBeUndefined();
  });

  it("normalises an unknown id rather than echoing it", () => {
    // A typo, a stale bookmark, or a forged value. Echoing it would carry the
    // bad id into the pagination href — the same bug the status rule guards.
    const query = parseStaffProductsQuery({ category: "not-a-real-id" }, CATEGORIES);
    expect(query.category).toBe(CATEGORY_ALL);
    expect(query.categoryIds).toBeUndefined();
  });

  it("ignores an id belonging to another vendor, because it is not in this list", () => {
    // Vendor scoping for this filter IS the supplied list: the caller passes its
    // own categories, so someone else's id can never resolve.
    const query = parseStaffProductsQuery({ category: "cat-other-vendor" }, CATEGORIES);
    expect(query.category).toBe(CATEGORY_ALL);
    expect(query.categoryIds).toBeUndefined();
  });

  it("expands a department to itself plus its subcategories", () => {
    const query = parseStaffProductsQuery({ category: GRAINS.id }, CATEGORIES);
    expect(query.category).toBe(GRAINS.id);
    expect(query.categoryIds).toEqual([GRAINS.id, RICE.id, FLOUR.id]);
  });

  it("keeps a subcategory selection exact, without its siblings", () => {
    const query = parseStaffProductsQuery({ category: RICE.id }, CATEGORIES);
    expect(query.category).toBe(RICE.id);
    expect(query.categoryIds).toEqual([RICE.id]);
    expect(query.categoryIds).not.toContain(FLOUR.id);
  });

  it("yields [id] rather than [] for a department with no subcategories", () => {
    // The empty-array case is the one that matters: `in: []` matches nothing,
    // so it would render as a working filter over an empty department.
    const query = parseStaffProductsQuery({ category: DRINKS.id }, CATEGORIES);
    expect(query.categoryIds).toEqual([DRINKS.id]);
    expect(query.categoryIds).not.toEqual([]);
  });

  it("treats an orphan child as exact — it can have no descendants", () => {
    const query = parseStaffProductsQuery({ category: ORPHAN.id }, CATEGORIES);
    expect(query.category).toBe(ORPHAN.id);
    expect(query.categoryIds).toEqual([ORPHAN.id]);
  });

  it("never returns an empty categoryIds array for any input", () => {
    const inputs = ["", "   ", CATEGORY_ALL, "nope", GRAINS.id, RICE.id, DRINKS.id, ORPHAN.id];
    for (const category of inputs) {
      const { categoryIds } = parseStaffProductsQuery({ category }, CATEGORIES);
      expect(categoryIds === undefined || categoryIds.length > 0).toBe(true);
    }
  });

  it("resolves nothing when the vendor has no categories at all", () => {
    const query = parseStaffProductsQuery({ category: GRAINS.id }, []);
    expect(query.category).toBe(CATEGORY_ALL);
    expect(query.categoryIds).toBeUndefined();
  });
});

describe("staffProductsHref", () => {
  it("returns the bare path when nothing is filtered", () => {
    expect(staffProductsHref(parseStaffProductsQuery({}, CATEGORIES))).toBe("/staff/products");
  });

  it("omits the default status so the common URL stays clean", () => {
    const href = staffProductsHref(
      parseStaffProductsQuery({ status: PRODUCT_STATUS_ALL }, CATEGORIES),
      "abc",
    );
    expect(href).toBe("/staff/products?cursor=abc");
  });

  it("carries the active filter and search into the next-page link", () => {
    const query = parseStaffProductsQuery({ status: "inactive", q: "basmati rice" }, CATEGORIES);
    const href = staffProductsHref(query, "cur123");
    expect(href).toContain("status=inactive");
    expect(href).toContain("q=basmati+rice");
    expect(href).toContain("cursor=cur123");
  });

  it("encodes a search term that would otherwise break the query string", () => {
    const query = parseStaffProductsQuery({ q: "a&b=c" }, CATEGORIES);
    expect(staffProductsHref(query)).toBe("/staff/products?q=a%26b%3Dc");
  });

  it("omits the cursor when there is no next page", () => {
    const query = parseStaffProductsQuery({ q: "rice" }, CATEGORIES);
    expect(staffProductsHref(query, null)).toBe("/staff/products?q=rice");
  });

  it("carries the selected category into the next-page link (#503)", () => {
    // The whole point of R18: a next page that quietly widened back to the full
    // catalogue would be worse than no paging at all.
    const query = parseStaffProductsQuery({ category: GRAINS.id }, CATEGORIES);
    expect(staffProductsHref(query, "cur999")).toContain(`category=${GRAINS.id}`);
  });

  it("omits the category when none is selected", () => {
    for (const category of ["", CATEGORY_ALL, "not-a-real-id"]) {
      const query = parseStaffProductsQuery({ category }, CATEGORIES);
      expect(staffProductsHref(query, "cur1")).not.toContain("category=");
    }
  });

  it("carries status, search and category together", () => {
    const query = parseStaffProductsQuery(
      { status: "active", q: "rice", category: RICE.id },
      CATEGORIES,
    );
    const href = staffProductsHref(query, "cur42");
    expect(href).toContain("status=active");
    expect(href).toContain("q=rice");
    expect(href).toContain(`category=${RICE.id}`);
    expect(href).toContain("cursor=cur42");
  });
});
