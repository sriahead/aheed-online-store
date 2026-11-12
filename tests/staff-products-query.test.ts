import { describe, expect, it } from "vitest";
import {
  CATEGORY_ALL,
  PRODUCT_STATUS_ALL,
  type CategoryChoice,
  clampPage,
  pageCount,
  pageWindow,
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
      2,
    );
    expect(href).toBe("/staff/products?page=2");
  });

  it("carries the active filter and search into the next-page link", () => {
    const query = parseStaffProductsQuery({ status: "inactive", q: "basmati rice" }, CATEGORIES);
    const href = staffProductsHref(query, 3);
    expect(href).toContain("status=inactive");
    expect(href).toContain("q=basmati+rice");
    expect(href).toContain("page=3");
  });

  it("encodes a search term that would otherwise break the query string", () => {
    const query = parseStaffProductsQuery({ q: "a&b=c" }, CATEGORIES);
    expect(staffProductsHref(query)).toBe("/staff/products?q=a%26b%3Dc");
  });

  it("omits the page for page 1 or none (#1523)", () => {
    const query = parseStaffProductsQuery({ q: "rice" }, CATEGORIES);
    expect(staffProductsHref(query, null)).toBe("/staff/products?q=rice");
    expect(staffProductsHref(query, 1)).toBe("/staff/products?q=rice");
  });

  it("carries the selected category into the next-page link (#503)", () => {
    // The whole point of R18: a next page that quietly widened back to the full
    // catalogue would be worse than no paging at all.
    const query = parseStaffProductsQuery({ category: GRAINS.id }, CATEGORIES);
    expect(staffProductsHref(query, 2)).toContain(`category=${GRAINS.id}`);
  });

  it("omits the category when none is selected", () => {
    for (const category of ["", CATEGORY_ALL, "not-a-real-id"]) {
      const query = parseStaffProductsQuery({ category }, CATEGORIES);
      expect(staffProductsHref(query, 2)).not.toContain("category=");
    }
  });

  it("carries status, search and category together", () => {
    const query = parseStaffProductsQuery(
      { status: "active", q: "rice", category: RICE.id },
      CATEGORIES,
    );
    const href = staffProductsHref(query, 42);
    expect(href).toContain("status=active");
    expect(href).toContain("q=rice");
    expect(href).toContain(`category=${RICE.id}`);
    expect(href).toContain("page=42");
  });
});

describe("parseStaffProductsQuery — restriction, stock and page size (#1211, R22)", () => {
  it("defaults to no restriction filter, no stock filter and 25 per page", () => {
    const query = parseStaffProductsQuery({}, CATEGORIES);
    expect(query.restriction).toBeUndefined();
    expect(query.stockMode).toBeUndefined();
    expect(query.restrictionFilter).toBe("all");
    expect(query.stockFilter).toBe("all");
    expect(query.perPage).toBe(25);
  });

  it("accepts any, none and each restriction class exactly", () => {
    for (const value of [
      "any",
      "none",
      "PROHIBITED",
      "AGE_RESTRICTED",
      "NOT_DELIVERABLE",
      "NEEDS_REVIEW",
    ]) {
      expect(parseStaffProductsQuery({ restriction: value }, CATEGORIES).restriction).toBe(value);
    }
  });

  it("treats an unknown restriction or stock value as unfiltered", () => {
    const query = parseStaffProductsQuery({ restriction: "bogus", stock: "tracked" }, CATEGORIES);
    expect(query.restriction).toBeUndefined();
    expect(query.restrictionFilter).toBe("all");
    expect(query.stockMode).toBeUndefined();
  });

  it("accepts each stock mode", () => {
    for (const value of ["TRACKED", "UNTRACKED", "UNKNOWN"]) {
      expect(parseStaffProductsQuery({ stock: value }, CATEGORIES).stockMode).toBe(value);
    }
  });

  it("offers 25, 50 or 100 per page and treats anything else (including all) as 25", () => {
    expect(parseStaffProductsQuery({ perPage: "100" }, CATEGORIES).perPage).toBe(100);
    expect(parseStaffProductsQuery({ perPage: "50" }, CATEGORIES).perPage).toBe(50);
    expect(parseStaffProductsQuery({ perPage: "all" }, CATEGORIES).perPage).toBe(25);
    expect(parseStaffProductsQuery({ perPage: "7" }, CATEGORIES).perPage).toBe(25);
    expect(parseStaffProductsQuery({ perPage: "1000" }, CATEGORIES).perPage).toBe(25);
    expect(parseStaffProductsQuery({ perPage: "abc" }, CATEGORIES).perPage).toBe(25);
  });

  it("carries the new filters into the next-page link, omitting defaults", () => {
    const href = staffProductsHref(
      parseStaffProductsQuery(
        { restriction: "NEEDS_REVIEW", stock: "UNKNOWN", perPage: "100" },
        CATEGORIES,
      ),
      2,
    );
    expect(href).toContain("restriction=NEEDS_REVIEW");
    expect(href).toContain("stock=UNKNOWN");
    expect(href).toContain("perPage=100");
    expect(staffProductsHref(parseStaffProductsQuery({ perPage: "25" }, CATEGORIES))).toBe(
      "/staff/products",
    );
  });
});

describe("parseStaffProductsQuery — sort, needs and page (#1523)", () => {
  it("defaults to newest, no needs filter and page 1", () => {
    const query = parseStaffProductsQuery({}, CATEGORIES);
    expect(query.sort).toBe("newest");
    expect(query.needs).toBeUndefined();
    expect(query.needsFilter).toBe("all");
    expect(query.page).toBe(1);
  });

  it("accepts every sort and needs value exactly, and nothing else", () => {
    for (const sort of ["newest", "name", "price-asc", "price-desc"]) {
      expect(parseStaffProductsQuery({ sort }, CATEGORIES).sort).toBe(sort);
    }
    expect(parseStaffProductsQuery({ sort: "NAME" }, CATEGORIES).sort).toBe("newest");
    for (const needs of ["price", "ready", "image"]) {
      expect(parseStaffProductsQuery({ needs }, CATEGORIES).needs).toBe(needs);
    }
    expect(parseStaffProductsQuery({ needs: "bogus" }, CATEGORIES).needs).toBeUndefined();
  });

  it("parses page as a positive integer only", () => {
    expect(parseStaffProductsQuery({ page: "4" }, CATEGORIES).page).toBe(4);
    for (const page of ["abc", "0", "-3", "1.5", "2abc", "1e3", ""]) {
      expect(parseStaffProductsQuery({ page }, CATEGORIES).page).toBe(1);
    }
  });

  it("round-trips every parameter through the href (R10)", () => {
    const input = {
      status: "inactive",
      q: "prawns 13/15",
      category: RICE.id,
      restriction: "none",
      stock: "UNTRACKED",
      perPage: "50",
      sort: "price-desc",
      needs: "ready",
    };
    const query = parseStaffProductsQuery(input, CATEGORIES);
    const href = staffProductsHref(query, 7);
    const params = Object.fromEntries(new URL(href, "https://x.test").searchParams);
    expect(params).toEqual({ ...input, page: "7" });
    const again = parseStaffProductsQuery(params, CATEGORIES);
    expect(again).toEqual({ ...query, page: 7 });
  });
});

describe("pageCount, clampPage and pageWindow (#1523)", () => {
  it("counts pages, never fewer than one", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(6238, 100)).toBe(63);
  });

  it("clamps a stale page to the last page and a low one to 1", () => {
    expect(clampPage(999, 3)).toBe(3);
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(5, 1)).toBe(1);
  });

  it("shows every page when there are seven or fewer", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps first, last and two either side of the current page, with gaps", () => {
    expect(pageWindow(1, 250)).toEqual([1, 2, 3, "gap", 250]);
    expect(pageWindow(50, 250)).toEqual([1, "gap", 48, 49, 50, 51, 52, "gap", 250]);
    expect(pageWindow(250, 250)).toEqual([1, "gap", 248, 249, 250]);
  });

  it("shows a single skipped page instead of a gap", () => {
    expect(pageWindow(5, 20)).toEqual([1, 2, 3, 4, 5, 6, 7, "gap", 20]);
  });
});
