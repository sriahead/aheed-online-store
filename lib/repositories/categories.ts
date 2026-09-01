import type { getPrisma } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import type { CatalogueWriteResult } from "@/lib/repositories/products";

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
}

export interface CategoryWithChildren extends CategorySummary {
  children: CategorySummary[];
  /**
   * #498 — non-null only when this category IS a subcategory (the tree is
   * capped at two levels, so a top-level department's `parent` is always
   * null). Carries the parent's OWN `children` — i.e. this category's
   * siblings, itself included — so a subcategory's own page can render the
   * same full tab row as its parent's page, rather than showing no
   * navigation at all once you've clicked into one.
   */
  parent: (CategorySummary & { children: CategorySummary[] }) | null;
}

export interface CategoryRepository {
  listTopLevel(): Promise<CategorySummary[]>;
  getBySlug(slug: string): Promise<CategoryWithChildren | null>;
}

/**
 * Storefront category reads. Both take `prisma` and `vendorId` explicitly and
 * read no request context — the request-scoped facade that resolves those lives
 * in `lib/categories-service.ts` (#252).
 */
export async function listTopLevelCategories(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<CategorySummary[]> {
  return prisma.category.findMany({
    where: { vendorId, parentId: null, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true, name: true },
  });
}

export async function getCategoryBySlug(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  slug: string,
): Promise<CategoryWithChildren | null> {
  return prisma.category.findFirst({
    where: { vendorId, slug, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      children: {
        where: { vendorId, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, name: true },
      },
      parent: {
        select: {
          id: true,
          slug: true,
          name: true,
          children: {
            where: { vendorId, isActive: true },
            orderBy: { sortOrder: "asc" },
            select: { id: true, slug: true, name: true },
          },
        },
      },
    },
  });
}

/* ------------------------------------------------------------------------- *
 * Admin catalogue path (P6b1, #159)
 *
 * Same three properties as the product writes: `vendorId` is an explicit
 * argument, no admin read filters `isActive`, and human-caused errors come back
 * as data.
 *
 * THE TREE IS TWO LEVELS DEEP, structurally. A category's parent must itself be
 * top-level, which is not a new restriction — `listTopLevel()` plus
 * `getBySlug()`'s single `children` fetch is the only shape the storefront can
 * render, so a grandchild would simply be invisible. Enforcing it here makes a
 * cycle (a category reachable from itself) unrepresentable rather than merely
 * unlikely, with no recursive walk to get wrong. Recorded in
 * specs/architecture.md beside the model, not only here.
 * ------------------------------------------------------------------------- */

export interface AdminCategoryRow {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export interface AdminCategoryDetail {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Everything a category write needs, already validated by lib/catalogue-form.ts. */
export interface CategoryWriteInput {
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Every category for this vendor, active or not, parents before children.
 *
 * Deliberately unpaginated: the two-level cap plus a real grocery department
 * list keeps this in the dozens, and the parent picker on the form needs the
 * whole set anyway. If that ever stops being true it becomes the same keyset
 * problem the product list already solves.
 */
export async function listCategoriesForAdmin(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<AdminCategoryRow[]> {
  const rows = await prisma.category.findMany({
    where: { vendorId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      sortOrder: true,
      isActive: true,
      parent: { select: { name: true } },
      _count: { select: { products: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parentId,
    parentName: row.parent?.name ?? null,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    productCount: row._count.products,
  }));
}

export async function getCategoryForAdmin(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
): Promise<AdminCategoryDetail | null> {
  return prisma.category.findFirst({
    where: { id, vendorId },
    select: { id: true, slug: true, name: true, parentId: true, sortOrder: true, isActive: true },
  });
}

const DUPLICATE_SLUG = {
  ok: false as const,
  error: "Another category in this store already uses that web address.",
  field: "slug",
};

/**
 * Resolve the submitted parent, or explain why it is unusable.
 *
 * `selfId` is the category being edited — a category that is its own parent is
 * the one-node cycle the depth cap would otherwise still allow.
 */
async function checkParent(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  parentId: string | null,
  selfId: string | null,
): Promise<{ ok: true } | { ok: false; error: string; field: string }> {
  if (parentId === null) return { ok: true };

  if (selfId !== null && parentId === selfId) {
    return { ok: false, error: "A category can't be its own parent.", field: "parentId" };
  }

  const parent = await prisma.category.findFirst({
    where: { id: parentId, vendorId },
    select: { parentId: true },
  });
  // Another vendor's category is indistinguishable from one that doesn't exist.
  if (!parent) {
    return { ok: false, error: "Choose a parent that belongs to this store.", field: "parentId" };
  }
  if (parent.parentId !== null) {
    return {
      ok: false,
      error: "Categories only go two levels deep — pick a top-level category as the parent.",
      field: "parentId",
    };
  }
  return { ok: true };
}

export async function createCategoryForVendor(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  input: CategoryWriteInput,
): Promise<CatalogueWriteResult> {
  const parent = await checkParent(prisma, vendorId, input.parentId, null);
  if (!parent.ok) return parent;

  try {
    const created = await prisma.category.create({
      data: {
        vendorId,
        name: input.name,
        slug: input.slug,
        parentId: input.parentId,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE_SLUG;
    throw error;
  }
}

export async function updateCategoryForVendor(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
  input: CategoryWriteInput,
): Promise<CatalogueWriteResult> {
  const existing = await prisma.category.findFirst({
    where: { id, vendorId },
    select: { isActive: true },
  });
  if (!existing) return { ok: false, error: "That category no longer exists." };

  const parent = await checkParent(prisma, vendorId, input.parentId, id);
  if (!parent.ok) return parent;

  // Only on the ACTIVE -> INACTIVE transition. Testing the resulting state
  // instead would make an already-inactive category that has active products
  // impossible to edit at all — including impossible to rename or re-activate.
  if (existing.isActive && !input.isActive) {
    const [activeProducts, activeChildren] = await Promise.all([
      prisma.product.count({ where: { vendorId, categoryId: id, isActive: true } }),
      prisma.category.count({ where: { vendorId, parentId: id, isActive: true } }),
    ]);
    if (activeProducts > 0 || activeChildren > 0) {
      // Named, not cascaded: one click quietly rewriting an unbounded number of
      // rows the owner never saw is the wrong default, and there is no undo.
      const blockers = [
        activeProducts > 0 &&
          `${activeProducts} active ${activeProducts === 1 ? "product" : "products"}`,
        activeChildren > 0 &&
          `${activeChildren} active ${activeChildren === 1 ? "sub-category" : "sub-categories"}`,
      ].filter((part): part is string => part !== false);
      return {
        ok: false,
        error: `This category still has ${blockers.join(" and ")}. Deactivate or move ${
          blockers.length > 1 ? "them" : "those"
        } first.`,
        field: "isActive",
      };
    }
  }

  try {
    await prisma.category.update({
      where: { id, vendorId },
      data: {
        name: input.name,
        slug: input.slug,
        parentId: input.parentId,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE_SLUG;
    throw error;
  }
}
