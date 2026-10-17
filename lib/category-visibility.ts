import type { Prisma } from "@prisma/client";

/**
 * #1131 — the one definition of "a shopper can see this category".
 *
 * A category is visible when it is active AND either has no parent or has an active parent. The
 * tree is two levels deep (specs/architecture.md, beside the Category model), so checking the
 * parent once is the whole rule — there is no grandparent to walk to.
 *
 * WHY THE PARENT MATTERS. Switching a department off leaves its subcategories' own `isActive`
 * untouched, deliberately: switching it back on must restore exactly what was there, and a cascade
 * would have to remember which children were already off. So a subcategory under a hidden
 * department is still `isActive: true`, and only this predicate hides it.
 *
 * Every storefront product read in `lib/repositories/products.ts` filters through this as
 * `category: visibleCategoryWhere`, and `tests/storefront-product-visibility.test.ts` fails a read
 * that does not. Before this, product reads filtered `Product.isActive` alone, so a hidden
 * department's products stayed in search, on their own pages and in the sitemap.
 *
 * Pure data, no I/O, no request context: both the repositories and a plain `tsx` script can use it.
 */
export const visibleCategoryWhere = {
  isActive: true,
  OR: [{ parentId: null }, { parent: { isActive: true } }],
} satisfies Prisma.CategoryWhereInput;
