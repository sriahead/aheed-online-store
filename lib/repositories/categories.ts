import type { getPrisma } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import type { CatalogueWriteResult } from "@/lib/repositories/products";
import { visibleCategoryWhere } from "@/lib/category-visibility";
import { composePublicUrl } from "@/lib/storage";

/**
 * Resolves a category's public image URL (ADR-003, #1278).
 *
 * If `imageKey` is set and `cdnBaseUrl` is provided, composes via `composePublicUrl`.
 * If `imageKey` is a static path starting with '/' or 'http', returns it directly.
 * Otherwise, falls back to the canonical static photography asset `/images/categories/${slug}.webp`.
 */
export function composeCategoryImageUrl(
  imageKey: string | null | undefined,
  slug: string,
  cdnBaseUrl?: string | null,
): string | null {
  if (imageKey && cdnBaseUrl) {
    return composePublicUrl(cdnBaseUrl, imageKey);
  }
  if (imageKey && (imageKey.startsWith("/") || imageKey.startsWith("http"))) {
    return imageKey;
  }
  return `/images/categories/${slug}.jpg`;
}

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  imageKey?: string | null;
  imageUrl?: string | null;
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
  /** Autocomplete category suggestions (#568) — see `suggestCategories`. */
  suggest(terms: readonly string[], limit: number): Promise<CategorySummary[]>;
  /** The whole active tree in one read (#681) — see `listCategoryTreeForStorefront`. */
  listTree(): Promise<StorefrontCategoryNode[]>;
}

/**
 * A category as the storefront's filter control needs it: a `CategorySummary` plus the two fields
 * required to group departments and their children (#681).
 *
 * `isActive` is carried even though `listCategoryTreeForStorefront` only ever returns active rows,
 * because it is what makes this type structurally satisfy `CategoryOption` in
 * `lib/catalogue-form.ts` — which is what lets the storefront reuse `toCategoryOptionGroups`
 * rather than growing a second, near-identical grouping function.
 */
export interface StorefrontCategoryNode extends CategorySummary {
  parentId: string | null;
  isActive: boolean;
}

/**
 * Storefront category reads. Both take `prisma` and `vendorId` explicitly and
 * read no request context — the request-scoped facade that resolves those lives
 * in `lib/categories-service.ts` (#252).
 */
export async function listTopLevelCategories(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  cdnBaseUrl?: string | null,
): Promise<CategorySummary[]> {
  const rows = await prisma.category.findMany({
    where: { vendorId, parentId: null, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true, name: true, imageKey: true },
  });
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    imageKey: c.imageKey,
    imageUrl: composeCategoryImageUrl(c.imageKey, c.slug, cdnBaseUrl),
  }));
}

/**
 * Every active category for this vendor, both tiers, in one read (#681).
 *
 * WHY THIS EXISTS RATHER THAN A SECOND CALL BESIDE `listTopLevelCategories`. The storefront filter
 * panel's category control offers departments AND their subcategories at once, so it needs the
 * whole tree; `listTopLevelCategories` returns departments only (`parentId: null`). Rather than
 * issue both, `/search` issues THIS ONE and derives its department strip from the rows whose
 * `parentId` is null — so the page's category query count is unchanged by gaining the control,
 * which matters because read amplification on these pages is a live concern (#670, #682).
 *
 * Ordering is `(sortOrder, name)` — the same global ordering `listTopLevelCategories` uses,
 * extended with a tiebreak so two categories sharing a `sortOrder` render in a stable order rather
 * than whatever the planner returns. Grouping into departments-with-children is NOT done here: it
 * is pure, it is `toCategoryOptionGroups`' job (`lib/catalogue-form.ts`), and doing it in SQL would
 * move the one rule worth unit-testing into a query shape that needs a database to assert.
 */
export async function listCategoryTreeForStorefront(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  cdnBaseUrl?: string | null,
): Promise<StorefrontCategoryNode[]> {
  const rows = await prisma.category.findMany({
    // #1131 — visible, not merely active: a subcategory under a hidden department keeps its own
    // `isActive: true` (see lib/category-visibility.ts), so `isActive` alone would leak it into
    // /search's tree, /bundles and the sitemap.
    where: { vendorId, ...visibleCategoryWhere },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, parentId: true, isActive: true, imageKey: true },
  });
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    parentId: c.parentId,
    isActive: c.isActive,
    imageKey: c.imageKey,
    imageUrl: composeCategoryImageUrl(c.imageKey, c.slug, cdnBaseUrl),
  }));
}

/**
 * Autocomplete category suggestions (#568).
 *
 * `OR` across terms rather than `AND`, unlike the product suggestions beside it, and the asymmetry
 * is deliberate: a category name is one or two words, so requiring every term of a multi-word query
 * to appear in it would mean a shopper typing "basmati rice" is offered no category at all — while
 * "Rice" is exactly the useful thing to offer them. Products stay `AND` because there the extra
 * terms are how a shopper narrows to the one item they want.
 *
 * Includes subcategories (no `parentId` filter): drilling straight to "Lentils and Pulses" is the
 * more useful destination when the shopper has already typed enough to name it.
 */
export async function suggestCategories(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  terms: readonly string[],
  limit: number,
  cdnBaseUrl?: string | null,
): Promise<CategorySummary[]> {
  if (terms.length === 0) return [];
  const rows = await prisma.category.findMany({
    where: {
      vendorId,
      // #1131 — under `AND`, not spread: the visibility predicate and the term match each carry an
      // `OR`, and spreading one would silently overwrite the other.
      AND: [visibleCategoryWhere],
      OR: terms.map((term) => ({ name: { contains: term, mode: "insensitive" as const } })),
    },
    orderBy: { sortOrder: "asc" },
    take: limit,
    select: { id: true, slug: true, name: true, imageKey: true },
  });
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    imageKey: c.imageKey,
    imageUrl: composeCategoryImageUrl(c.imageKey, c.slug, cdnBaseUrl),
  }));
}

export async function getCategoryBySlug(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  slug: string,
  cdnBaseUrl?: string | null,
): Promise<CategoryWithChildren | null> {
  const row = await prisma.category.findFirst({
    // #1131 — a hidden department's page 404s, and so does a subcategory under one.
    where: { vendorId, slug, ...visibleCategoryWhere },
    select: {
      id: true,
      slug: true,
      name: true,
      imageKey: true,
      children: {
        where: { vendorId, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, name: true, imageKey: true },
      },
      parent: {
        select: {
          id: true,
          slug: true,
          name: true,
          imageKey: true,
          children: {
            where: { vendorId, isActive: true },
            orderBy: { sortOrder: "asc" },
            select: { id: true, slug: true, name: true, imageKey: true },
          },
        },
      },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    imageKey: row.imageKey,
    imageUrl: composeCategoryImageUrl(row.imageKey, row.slug, cdnBaseUrl),
    children: (row.children ?? []).map((child) => ({
      id: child.id,
      slug: child.slug,
      name: child.name,
      imageKey: child.imageKey,
      imageUrl: composeCategoryImageUrl(child.imageKey, child.slug, cdnBaseUrl),
    })),
    parent: row.parent
      ? {
          id: row.parent.id,
          slug: row.parent.slug,
          name: row.parent.name,
          imageKey: row.parent.imageKey,
          imageUrl: composeCategoryImageUrl(row.parent.imageKey, row.parent.slug, cdnBaseUrl),
          children: (row.parent.children ?? []).map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            imageKey: c.imageKey,
            imageUrl: composeCategoryImageUrl(c.imageKey, c.slug, cdnBaseUrl),
          })),
        }
      : null,
  };
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
  imageKey?: string | null;
  productCount: number;
}

export interface AdminCategoryDetail {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  imageKey?: string | null;
  imageUrl?: string | null;
  /** #1135 — products here (and in sub-categories) take a shopper note. */
  allowsCustomNote: boolean;
}

/** Everything a category write needs, already validated by lib/catalogue-form.ts. */
export interface CategoryWriteInput {
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  imageKey?: string | null;
  /** #1135 — products in this category (and its sub-categories) take a shopper note. Absent (a
   * script, a seed) leaves the stored value alone on update and takes the column default on create. */
  allowsCustomNote?: boolean;
}

/**
 * Order `AdminCategoryRow[]` so each parent is immediately followed by its own
 * children (#627).
 *
 * Pure and exported so it can be unit-tested without a database — the ordering
 * IS the requirement here, and proving it against a live query would prove only
 * that one fixture happens to come back right.
 *
 * Why this exists at all: the query below orders by `(sortOrder, name)` as a
 * single GLOBAL ordering. `prisma/seed.ts` gives top-level categories no
 * `sortOrder`, so all 13 take the schema default of `0`, while children get
 * `0,1,2` WITHIN each parent. The `sortOrder: 0` bucket therefore held every
 * department plus every first-child, sorted by name alone, and the page indents
 * any row carrying a `parentId` — so an indented Household subcategory rendered
 * directly beneath Beverages. Sorting in the page would have fixed the list and
 * left `ProductForm`'s picker, fed by the same function, still interleaved.
 *
 * A row whose `parentId` names a category absent from `rows` is treated as
 * top-level rather than dropped. That cannot happen through the schema (the FK
 * and the two-level cap both hold), but silently losing a category from the
 * admin list is a far worse failure than showing one un-nested, and the cost of
 * being certain is one lookup.
 */
export function groupCategoryRowsByParent(rows: readonly AdminCategoryRow[]): AdminCategoryRow[] {
  const byPosition = (a: AdminCategoryRow, b: AdminCategoryRow) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

  const topLevelIds = new Set(rows.filter((row) => row.parentId === null).map((row) => row.id));
  const isTopLevel = (row: AdminCategoryRow) =>
    row.parentId === null || !topLevelIds.has(row.parentId);

  const childrenByParent = new Map<string, AdminCategoryRow[]>();
  for (const row of rows) {
    if (isTopLevel(row)) continue;
    const siblings = childrenByParent.get(row.parentId!);
    if (siblings) siblings.push(row);
    else childrenByParent.set(row.parentId!, [row]);
  }

  const ordered: AdminCategoryRow[] = [];
  for (const parent of rows.filter(isTopLevel).sort(byPosition)) {
    ordered.push(parent);
    const children = childrenByParent.get(parent.id);
    if (children) ordered.push(...children.sort(byPosition));
  }

  return ordered;
}

/**
 * Every category for this vendor, active or not, each parent immediately
 * followed by its own children (#627 — this said "parents before children"
 * while returning them globally interleaved).
 *
 * Deliberately unpaginated: the two-level cap plus a real grocery department
 * list keeps this in the dozens, and the parent picker on the form needs the
 * whole set anyway. If that ever stops being true it becomes the same keyset
 * problem the product list already solves. That cap is also what makes the
 * in-memory regroup below honest rather than a hidden scaling problem.
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
      imageKey: true,
      parent: { select: { name: true } },
      _count: { select: { products: true } },
    },
  });

  return groupCategoryRowsByParent(
    rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      parentId: row.parentId,
      parentName: row.parent?.name ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      imageKey: row.imageKey,
      productCount: row._count.products,
    })),
  );
}

export async function getCategoryForAdmin(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
  cdnBaseUrl?: string | null,
): Promise<AdminCategoryDetail | null> {
  const row = await prisma.category.findFirst({
    where: { id, vendorId },
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      sortOrder: true,
      isActive: true,
      imageKey: true,
      allowsCustomNote: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    imageUrl: composeCategoryImageUrl(row.imageKey, row.slug, cdnBaseUrl),
  };
}

/** What switching a category off hides from shoppers (#1131) — see `countHiddenWithCategory`. */
export interface CategoryHiddenCounts {
  /** Active products in this category and in its active sub-categories. */
  products: number;
  /** Active direct sub-categories. Always 0 for a sub-category (the tree is two levels deep). */
  subCategories: number;
}

/**
 * How many active products and sub-categories stop being shown when this category is switched off
 * (#1131). Read-only and advisory: the staff form states it beside "Visible in the shop" so the
 * consequence is visible BEFORE the save, which is what #159's refusal used to provide.
 *
 * Products in an active sub-category count too, because a hidden department hides its whole
 * subtree (lib/category-visibility.ts). Products in a sub-category that is already off are not
 * counted — switching the parent changes nothing for them.
 */
export async function countHiddenWithCategory(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
): Promise<CategoryHiddenCounts> {
  const [products, subCategories] = await Promise.all([
    prisma.product.count({
      where: {
        vendorId,
        isActive: true,
        OR: [{ categoryId: id }, { category: { parentId: id, isActive: true } }],
      },
    }),
    prisma.category.count({ where: { vendorId, parentId: id, isActive: true } }),
  ]);
  return { products, subCategories };
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
        imageKey: input.imageKey,
        allowsCustomNote: input.allowsCustomNote,
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
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "That category no longer exists." };

  const parent = await checkParent(prisma, vendorId, input.parentId, id);
  if (!parent.ok) return parent;

  // #1131 — no refusal on the ACTIVE -> INACTIVE transition any more. #159 refused to switch off a
  // category that still had active products or sub-categories, because the only way to hide them
  // was to rewrite rows the owner never saw. Visibility is now derived (lib/category-visibility.ts):
  // switching a department off hides its products and sub-categories WITHOUT touching a row, and
  // switching it back on restores them. The form says what the switch will hide instead
  // (`countHiddenWithCategory`, components/staff/CategoryForm.tsx).

  try {
    await prisma.category.update({
      where: { id, vendorId },
      data: {
        name: input.name,
        slug: input.slug,
        parentId: input.parentId,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        imageKey: input.imageKey,
        allowsCustomNote: input.allowsCustomNote,
      },
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE_SLUG;
    throw error;
  }
}
