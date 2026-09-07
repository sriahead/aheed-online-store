import { describe, expect, it } from "vitest";
import { groupCategoryRowsByParent, type AdminCategoryRow } from "@/lib/repositories/categories";

/**
 * #627 — `listCategoriesForAdmin` ordered by `(sortOrder, name)` as a single
 * GLOBAL ordering with no `parentId` grouping.
 *
 * The fixture below reproduces the exact shape `prisma/seed.ts` produces,
 * because that shape is what made the defect real rather than theoretical:
 * top-level categories are created with no `sortOrder` and take the schema
 * default of `0`, while subcategories get `0,1,2` within each parent. So the
 * `sortOrder: 0` bucket held every department AND every first-child, sorted by
 * name alone — and the page indents any row with a `parentId`, so a Household
 * subcategory rendered directly under Beverages.
 *
 * A fixture that gave departments distinct sortOrder values would pass against
 * the OLD implementation too, and would prove nothing.
 */
function row(over: Partial<AdminCategoryRow> & Pick<AdminCategoryRow, "id" | "name">) {
  return {
    slug: over.name.toLowerCase().replace(/\s+/g, "-"),
    parentId: null,
    parentName: null,
    sortOrder: 0,
    isActive: true,
    productCount: 0,
    ...over,
  } as AdminCategoryRow;
}

/** Every department at sortOrder 0; children 0,1,2 within each parent. */
const FIXTURE: AdminCategoryRow[] = [
  row({ id: "bakery", name: "Bakery" }),
  row({ id: "beverages", name: "Beverages" }),
  row({ id: "household", name: "Household" }),
  // Frozen Foods is childless — the case a grouping implementation most often
  // gets wrong by emitting an empty group or dropping the department.
  row({ id: "frozen", name: "Frozen Foods" }),
  row({ id: "bread", name: "Bread and Loaves", parentId: "bakery", sortOrder: 0 }),
  row({ id: "cakes", name: "Cakes", parentId: "bakery", sortOrder: 1 }),
  row({ id: "cleaning", name: "Cleaning", parentId: "household", sortOrder: 0 }),
  row({ id: "juice", name: "Juice", parentId: "beverages", sortOrder: 1 }),
  row({ id: "tea", name: "Tea", parentId: "beverages", sortOrder: 0 }),
];

describe("groupCategoryRowsByParent (#627)", () => {
  it("places every parent immediately before its own children, contiguously", () => {
    const ordered = groupCategoryRowsByParent(FIXTURE);

    expect(ordered.map((r) => r.id)).toEqual([
      "bakery",
      "bread",
      "cakes",
      "beverages",
      "tea",
      "juice",
      "frozen",
      "household",
      "cleaning",
    ]);
  });

  it("leaves no unrelated row between a parent and its children", () => {
    const ordered = groupCategoryRowsByParent(FIXTURE);

    for (let i = 0; i < ordered.length; i++) {
      const parent = ordered[i];
      if (parent.parentId !== null) continue;

      const expectedChildren = FIXTURE.filter((r) => r.parentId === parent.id).length;
      const following = ordered.slice(i + 1, i + 1 + expectedChildren);

      expect(following.every((child) => child.parentId === parent.id)).toBe(true);
      expect(following).toHaveLength(expectedChildren);
    }
  });

  it("sorts top-level rows by sortOrder then name, even when every sortOrder is 0", () => {
    const tops = groupCategoryRowsByParent(FIXTURE)
      .filter((r) => r.parentId === null)
      .map((r) => r.name);

    // All four are sortOrder 0, so this is pure name ordering — the exact
    // situation the seed creates.
    expect(tops).toEqual(["Bakery", "Beverages", "Frozen Foods", "Household"]);
  });

  it("sorts each parent's children by sortOrder then name", () => {
    const ordered = groupCategoryRowsByParent(FIXTURE);
    const beverageChildren = ordered.filter((r) => r.parentId === "beverages").map((r) => r.name);

    // Tea is sortOrder 0 and Juice is 1, so sortOrder must beat alphabetical.
    expect(beverageChildren).toEqual(["Tea", "Juice"]);
  });

  it("keeps a childless department in the result exactly once", () => {
    const ordered = groupCategoryRowsByParent(FIXTURE);
    expect(ordered.filter((r) => r.id === "frozen")).toHaveLength(1);
  });

  it("drops no row, and returns an orphaned child rather than losing it", () => {
    // A child whose parent is absent from the set. The schema's FK and the
    // two-level cap make this unreachable in practice; losing a category from
    // the admin list silently would be far worse than showing one un-nested.
    const withOrphan = [
      ...FIXTURE,
      row({ id: "orphan", name: "Orphaned Aisle", parentId: "does-not-exist", sortOrder: 0 }),
    ];

    const ordered = groupCategoryRowsByParent(withOrphan);

    expect(ordered).toHaveLength(withOrphan.length);
    expect(ordered.filter((r) => r.id === "orphan")).toHaveLength(1);
    expect(new Set(ordered.map((r) => r.id))).toEqual(new Set(withOrphan.map((r) => r.id)));
  });

  it("returns an empty array unchanged", () => {
    expect(groupCategoryRowsByParent([])).toEqual([]);
  });
});
