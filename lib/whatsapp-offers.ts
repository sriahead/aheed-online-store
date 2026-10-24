import type { CategorySummary, StorefrontCategoryNode } from "@/lib/repositories/categories";
import type { OfferProductWithCategory, ProductSummary } from "@/lib/repositories/products";

/**
 * #1233 — pure department-grouping helper for `/whatsapp-offers`.
 *
 * Maps each offer product's `categoryId` (whether a top-level department or a second-tier
 * subcategory whose `parentId` points to a top-level department) to its top-level department in the
 * order `categoryTree` supplies (`(sortOrder, name)` from `listCategoryTreeForStorefront`), and
 * omits departments that have zero offer products.
 */
export interface DepartmentOfferGroup {
  department: CategorySummary;
  products: ProductSummary[];
}

export function groupOfferProductsByDepartment(
  items: readonly OfferProductWithCategory[],
  categoryTree: readonly StorefrontCategoryNode[],
): DepartmentOfferGroup[] {
  const departments: CategorySummary[] = [];
  const departmentIdByCategoryId = new Map<string, string>();
  const productsByDepartmentId = new Map<string, ProductSummary[]>();

  for (const node of categoryTree) {
    if (node.parentId === null) {
      departments.push({ id: node.id, slug: node.slug, name: node.name });
      departmentIdByCategoryId.set(node.id, node.id);
      productsByDepartmentId.set(node.id, []);
    }
  }

  for (const node of categoryTree) {
    if (node.parentId !== null && productsByDepartmentId.has(node.parentId)) {
      departmentIdByCategoryId.set(node.id, node.parentId);
    }
  }

  for (const { product, categoryId } of items) {
    const departmentId = departmentIdByCategoryId.get(categoryId);
    if (!departmentId) continue;
    productsByDepartmentId.get(departmentId)?.push(product);
  }

  return departments.flatMap((department) => {
    const products = productsByDepartmentId.get(department.id) ?? [];
    return products.length > 0 ? [{ department, products }] : [];
  });
}
