import { describe, expect, it } from "vitest";
import { toSearchDepartments } from "@/components/layout/search-departments";

/**
 * #1169 R2 — the header selector's options from `listTree()`: each department, then its
 * subcategories flagged for indenting, in tree order. Test data only; no vendor names (CLAUDE.md).
 */

const node = (id: string, slug: string, parentId: string | null = null) => ({
  id,
  slug,
  name: slug.toUpperCase(),
  parentId,
  isActive: true,
});

describe("toSearchDepartments (#1169 R2)", () => {
  it("puts each department's subcategories straight after it, in tree order", () => {
    // listTree() orders by sortOrder then name across BOTH tiers, so a child can come before its
    // own parent row; grouping must still place it under that parent and not drop it.
    const tree = [
      node("3", "two-a", "2"),
      node("2", "d-two"),
      node("1", "d-one"),
      node("4", "two-b", "2"),
    ];
    expect(toSearchDepartments(tree)).toEqual([
      { slug: "d-two", name: "D-TWO" },
      { slug: "two-a", name: "TWO-A", isSubcategory: true },
      { slug: "two-b", name: "TWO-B", isSubcategory: true },
      { slug: "d-one", name: "D-ONE" },
    ]);
  });

  it("lists a department with no subcategories on its own", () => {
    expect(toSearchDepartments([node("1", "solo")])).toEqual([{ slug: "solo", name: "SOLO" }]);
  });

  it("drops a subcategory whose department is not in the list", () => {
    expect(toSearchDepartments([node("1", "d-one"), node("9", "orphan", "hidden")])).toEqual([
      { slug: "d-one", name: "D-ONE" },
    ]);
  });
});
