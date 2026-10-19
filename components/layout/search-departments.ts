import type { StorefrontCategoryNode } from "@/lib/repositories/categories";
import type { SearchDepartment } from "./DepartmentSearchBar";

/**
 * #1169 — the header search selector's options: every visible department in tree order, each
 * followed straight away by its visible subcategories (flagged so the select indents them).
 *
 * Built from `listTree()`, which returns visible rows only, ordered `sortOrder` then `name` across
 * BOTH tiers at once. So a subcategory can arrive before its own department, and a one-pass grouping
 * (as `toCategoryOptionGroups` does) would silently drop it. Children are therefore collected first
 * and attached afterwards. A subcategory whose department is not in the list (hidden) is dropped,
 * matching `listTree()`'s own visibility rule. Pure, so it is tested without a database.
 */
export function toSearchDepartments(tree: readonly StorefrontCategoryNode[]): SearchDepartment[] {
  const departments = tree.filter((node) => node.parentId === null);
  const childrenByParent = new Map<string, StorefrontCategoryNode[]>();
  for (const node of tree) {
    if (node.parentId === null) continue;
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }
  return departments.flatMap((department) => [
    { slug: department.slug, name: department.name },
    ...(childrenByParent.get(department.id) ?? []).map((child) => ({
      slug: child.slug,
      name: child.name,
      isSubcategory: true,
    })),
  ]);
}
