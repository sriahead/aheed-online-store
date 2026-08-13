import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import { effectiveStock } from "@/lib/cart-rules";
import { CANDIDATE_QUERY_LIMIT, type ListCandidate } from "@/lib/shopping-list";

export interface ProductImageSummary {
  storageKey: string;
  alt: string;
  isPrimary: boolean;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  unitLabel: string;
  primaryImage: ProductImageSummary | null;
  origin: string | null;
  originalPrice: number | null;
  isHalal: boolean;
  isFresh: boolean;
  isOrganic: boolean;
  averageRating: number;
  reviewCount: number;
  /** P3a — cards need this to render the add-to-cart out-of-stock state. */
  inStock: boolean;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  images: ProductImageSummary[];
}

export interface ProductPage {
  items: ProductSummary[];
  nextCursor: string | null;
}

/** Shared filter shape for both listByCategory() and search() — one definition, not two. */
export interface ProductFilters {
  minPricePence?: number;
  maxPricePence?: number;
  inStockOnly?: boolean;
  isHalal?: boolean;
  isFresh?: boolean;
  isOrganic?: boolean;
}

/** Which speciality attributes the current vendor actually uses (≥1 active product). */
export interface AvailableSpecialities {
  halal: boolean;
  fresh: boolean;
  organic: boolean;
}

export interface ProductRepository {
  listByCategory(
    categoryId: string,
    opts: { take: number; cursor?: string } & ProductFilters,
  ): Promise<ProductPage>;
  search(
    query: string,
    opts: { take: number; cursor?: string } & ProductFilters,
  ): Promise<ProductPage>;
  getBySlug(slug: string): Promise<ProductDetail | null>;
  /** Drives per-vendor filter visibility — a food vendor shows Halal/Fresh/Organic; a tech one shows none. */
  availableSpecialities(): Promise<AvailableSpecialities>;
  /**
   * Candidate products for a whole "Shop your list" paste (P3d, #114), in ONE
   * query for the entire list rather than one per line. Deliberately separate
   * from search(): it matches `name` only (a term hitting prose in a
   * description yields a confident-looking wrong product) and leaves the
   * per-line all-terms decision to lib/shopping-list.ts.
   */
  matchListTerms(terms: string[]): Promise<ListCandidate[]>;
}

const productImageSelect = { storageKey: true, alt: true, isPrimary: true } as const;

function buildFilterWhere(filters: ProductFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (filters.minPricePence !== undefined || filters.maxPricePence !== undefined) {
    where.basePrice = {
      ...(filters.minPricePence !== undefined ? { gte: filters.minPricePence } : {}),
      ...(filters.maxPricePence !== undefined ? { lte: filters.maxPricePence } : {}),
    };
  }
  if (filters.inStockOnly) {
    where.inventory = { quantity: { gt: 0 } };
  }
  if (filters.isHalal) where.isHalal = true;
  if (filters.isFresh) where.isFresh = true;
  if (filters.isOrganic) where.isOrganic = true;
  return where;
}

/**
 * Prisma-backed ProductRepository. Constructed fresh per call, never cached
 * across requests — matches lib/db.ts's getPrisma() contract on Workers.
 */
export function getProductRepository(): ProductRepository {
  const prisma = getPrisma();
  // Resolve the current vendor once per repository instance (request-scoped);
  // never cached across requests. Every query below is scoped to it (ADR-004 slice 2).
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  async function findPage(
    where: Prisma.ProductWhereInput,
    { take, cursor }: { take: number; cursor?: string },
  ): Promise<ProductPage> {
    // Keyset (cursor) pagination on (createdAt, id) — never OFFSET, per
    // specs/architecture.md's pagination strategy. Over-fetch by one to
    // know whether a next page exists without a separate count query.
    const rows = await prisma.product.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        slug: true,
        name: true,
        basePrice: true,
        unitLabel: true,
        origin: true,
        originalPrice: true,
        isHalal: true,
        isFresh: true,
        isOrganic: true,
        averageRating: true,
        reviewCount: true,
        images: { where: { isPrimary: true }, take: 1, select: productImageSelect },
        inventory: { select: { quantity: true } },
      },
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return {
      items: page.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        basePrice: p.basePrice,
        unitLabel: p.unitLabel,
        origin: p.origin,
        originalPrice: p.originalPrice,
        isHalal: p.isHalal,
        isFresh: p.isFresh,
        isOrganic: p.isOrganic,
        averageRating: p.averageRating,
        reviewCount: p.reviewCount,
        primaryImage: p.images[0] ?? null,
        inStock: (p.inventory?.quantity ?? 0) > 0,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  return {
    async listByCategory(categoryId, { take, cursor, ...filters }) {
      return findPage(
        { vendorId: await vendorId(), categoryId, isActive: true, ...buildFilterWhere(filters) },
        { take, cursor },
      );
    },

    async search(query, { take, cursor, ...filters }) {
      const trimmed = query.trim();
      if (!trimmed) return { items: [], nextCursor: null };

      return findPage(
        {
          vendorId: await vendorId(),
          isActive: true,
          ...buildFilterWhere(filters),
          OR: [
            { name: { contains: trimmed, mode: "insensitive" } },
            { description: { contains: trimmed, mode: "insensitive" } },
          ],
        },
        { take, cursor },
      );
    },

    async getBySlug(slug) {
      const product = await prisma.product.findFirst({
        where: { vendorId: await vendorId(), slug, isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          basePrice: true,
          unitLabel: true,
          origin: true,
          originalPrice: true,
          isHalal: true,
          isFresh: true,
          isOrganic: true,
          averageRating: true,
          reviewCount: true,
          images: { orderBy: { sortOrder: "asc" }, select: productImageSelect },
          inventory: { select: { quantity: true } },
        },
      });
      if (!product) return null;

      const { inventory, images, ...rest } = product;
      return {
        ...rest,
        images,
        primaryImage: images.find((i) => i.isPrimary) ?? images[0] ?? null,
        inStock: (inventory?.quantity ?? 0) > 0,
      };
    },

    async availableSpecialities() {
      const base = { vendorId: await vendorId(), isActive: true };
      const [halal, fresh, organic] = await Promise.all([
        prisma.product.findFirst({ where: { ...base, isHalal: true }, select: { id: true } }),
        prisma.product.findFirst({ where: { ...base, isFresh: true }, select: { id: true } }),
        prisma.product.findFirst({ where: { ...base, isOrganic: true }, select: { id: true } }),
      ]);
      return { halal: halal !== null, fresh: fresh !== null, organic: organic !== null };
    },

    async matchListTerms(terms) {
      if (terms.length === 0) return [];

      const rows = await prisma.product.findMany({
        where: {
          vendorId: await vendorId(),
          isActive: true,
          OR: terms.map((term) => ({
            name: { contains: term, mode: "insensitive" as const },
          })),
        },
        take: CANDIDATE_QUERY_LIMIT,
        select: {
          id: true,
          slug: true,
          name: true,
          basePrice: true,
          unitLabel: true,
          inventory: { select: { quantity: true } },
        },
      });

      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        basePrice: row.basePrice,
        unitLabel: row.unitLabel,
        stock: effectiveStock(row.inventory?.quantity),
      }));
    },
  };
}

/* ------------------------------------------------------------------------- *
 * Admin catalogue path (P6b1, #159)
 *
 * The first WRITES on this repository — everything above is a query. Three
 * properties hold across all of it:
 *
 *  1. `vendorId` is an explicit ARGUMENT, never resolved from a form and never
 *     read from request context inside these functions. That is what lets a
 *     plain script exercise them (the `placeOrder(prisma, vendorId, input)`
 *     shape), and it is why no submitted field can redirect a write at another
 *     vendor's rows.
 *  2. No admin read filters `isActive`. The storefront reads above deliberately
 *     do, which is exactly why they cannot serve this surface: an owner has to
 *     be able to find and re-activate the product they just switched off.
 *  3. Errors a human can cause — a duplicate slug, a category that isn't
 *     theirs — come back as data. Only genuine faults throw.
 * ------------------------------------------------------------------------- */

/** Same shape lib/repositories/discounts.ts and loyalty.ts use, so a write can run inside a caller's transaction. */
type Db = ReturnType<typeof getPrisma>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
type AnyDb = Db | Tx;

export interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  isActive: boolean;
  categoryName: string;
  quantity: number;
}

export interface AdminProductPage {
  items: AdminProductRow[];
  nextCursor: string | null;
}

export interface AdminProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  basePrice: number;
  originalPrice: number | null;
  unitLabel: string;
  origin: string | null;
  isHalal: boolean;
  isFresh: boolean;
  isOrganic: boolean;
  isActive: boolean;
  quantity: number;
  lowStockThreshold: number;
  /** Read here; written by setPrimaryProductImage (P6b2, #167). */
  images: ProductImageSummary[];
}

/** Everything a product write needs, already validated by lib/catalogue-form.ts. */
export interface ProductWriteInput {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  basePrice: number;
  originalPrice: number | null;
  unitLabel: string;
  origin: string | null;
  isHalal: boolean;
  isFresh: boolean;
  isOrganic: boolean;
  isActive: boolean;
  quantity: number;
  lowStockThreshold: number;
}

export type CatalogueWriteResult =
  { ok: true; id: string } | { ok: false; error: string; field?: string };

export interface StaffInventoryRow {
  id: string;
  slug: string;
  name: string;
  unitLabel: string;
  basePrice: number;
  isActive: boolean;
  categoryName: string;
  quantity: number;
  primaryImage: ProductImageSummary | null;
}

export interface StaffInventoryPage {
  items: StaffInventoryRow[];
  nextCursor: string | null;
}

export async function listInventoryForStaff(
  vendorId: string,
  { take, cursor, query }: { take: number; cursor?: string; query?: string },
): Promise<StaffInventoryPage> {
  const prisma = getPrisma();
  const trimmed = query?.trim() ?? "";

  const whereClause: Prisma.ProductWhereInput = { vendorId };
  if (trimmed) {
    whereClause.OR = [
      { name: { contains: trimmed, mode: "insensitive" } },
      { description: { contains: trimmed, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.product.findMany({
    where: whereClause,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      slug: true,
      name: true,
      unitLabel: true,
      basePrice: true,
      isActive: true,
      category: { select: { name: true } },
      inventory: { select: { quantity: true } },
      images: { where: { isPrimary: true }, take: 1, select: productImageSelect },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      unitLabel: row.unitLabel,
      basePrice: row.basePrice,
      isActive: row.isActive,
      categoryName: row.category.name,
      quantity: row.inventory?.quantity ?? 0,
      primaryImage: row.images[0] ?? null,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/** Keyset-paginated on (createdAt, id) like findPage() above — never OFFSET. */
export async function listProductsForAdmin(
  vendorId: string,
  { take, cursor }: { take: number; cursor?: string },
): Promise<AdminProductPage> {
  const prisma = getPrisma();
  const rows = await prisma.product.findMany({
    where: { vendorId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      isActive: true,
      category: { select: { name: true } },
      inventory: { select: { quantity: true } },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      basePrice: row.basePrice,
      isActive: row.isActive,
      categoryName: row.category.name,
      quantity: row.inventory?.quantity ?? 0,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function getProductForAdmin(
  vendorId: string,
  id: string,
): Promise<AdminProductDetail | null> {
  const prisma = getPrisma();
  // findFirst, not findUnique: `id` alone is unique, but a vendor-less read has
  // no place in this layer (ADR-004 slice 2).
  const row = await prisma.product.findFirst({
    where: { id, vendorId },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      categoryId: true,
      basePrice: true,
      originalPrice: true,
      unitLabel: true,
      origin: true,
      isHalal: true,
      isFresh: true,
      isOrganic: true,
      isActive: true,
      inventory: { select: { quantity: true, lowStockThreshold: true } },
      images: { orderBy: { sortOrder: "asc" }, select: productImageSelect },
    },
  });
  if (!row) return null;

  const { inventory, ...product } = row;
  return {
    ...product,
    // A product seeded before P6b1 may have no Inventory row at all; the form
    // shows zeroes and the first save creates it (see updateProductForVendor).
    quantity: inventory?.quantity ?? 0,
    lowStockThreshold: inventory?.lowStockThreshold ?? 3,
  };
}

/**
 * The category is resolved SCOPED TO THE VENDOR, and its absence is the refusal.
 * `Product.categoryId`'s foreign key carries no vendor, so nothing in the schema
 * stops a form submitting another vendor's category id — this lookup is the only
 * thing that does. Same defence P3d used for its untrusted review-form ids.
 */
async function assertOwnCategory(
  db: AnyDb,
  vendorId: string,
  categoryId: string,
): Promise<boolean> {
  const category = await db.category.findFirst({
    where: { id: categoryId, vendorId },
    select: { id: true },
  });
  return category !== null;
}

const WRONG_CATEGORY = {
  ok: false as const,
  error: "Choose a category that belongs to this store.",
  field: "categoryId",
};

const DUPLICATE_SLUG = {
  ok: false as const,
  error: "Another product in this store already uses that web address.",
  field: "slug",
};

export async function createProductForVendor(
  vendorId: string,
  input: ProductWriteInput,
): Promise<CatalogueWriteResult> {
  const prisma = getPrisma();
  try {
    if (!(await assertOwnCategory(prisma, vendorId, input.categoryId))) return WRONG_CATEGORY;

    // The Inventory row is a NESTED create, so it commits in the same implicit
    // transaction as the Product. Two sequential calls could leave a product
    // with no stock row — which every reader then papers over with `?? 0`,
    // making "out of stock" and "never given stock" indistinguishable.
    const created = await prisma.product.create({
      data: {
        vendorId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        categoryId: input.categoryId,
        basePrice: input.basePrice,
        originalPrice: input.originalPrice,
        unitLabel: input.unitLabel,
        origin: input.origin,
        isHalal: input.isHalal,
        isFresh: input.isFresh,
        isOrganic: input.isOrganic,
        isActive: input.isActive,
        inventory: {
          create: {
            vendorId,
            quantity: input.quantity,
            lowStockThreshold: input.lowStockThreshold,
          },
        },
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE_SLUG;
    throw error;
  }
}

export async function updateProductForVendor(
  vendorId: string,
  id: string,
  input: ProductWriteInput,
): Promise<CatalogueWriteResult> {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id, vendorId },
        select: { id: true },
      });
      // Another vendor's product is indistinguishable from one that never existed.
      if (!existing) return { ok: false as const, error: "That product no longer exists." };

      if (!(await assertOwnCategory(tx, vendorId, input.categoryId))) return WRONG_CATEGORY;

      await tx.product.update({
        where: { id, vendorId },
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          categoryId: input.categoryId,
          basePrice: input.basePrice,
          originalPrice: input.originalPrice,
          unitLabel: input.unitLabel,
          origin: input.origin,
          isHalal: input.isHalal,
          isFresh: input.isFresh,
          isOrganic: input.isOrganic,
          isActive: input.isActive,
        },
      });

      // upsert, not update: a product created before this slice may have no
      // Inventory row, and the owner's first save is where it should appear
      // rather than failing on a missing record.
      await tx.inventory.upsert({
        where: { productId: id, vendorId },
        create: {
          vendorId,
          productId: id,
          quantity: input.quantity,
          lowStockThreshold: input.lowStockThreshold,
        },
        update: { quantity: input.quantity, lowStockThreshold: input.lowStockThreshold },
      });

      return { ok: true as const, id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE_SLUG;
    throw error;
  }
}

/**
 * Point a product's PRIMARY image at a newly uploaded key (P6b2, #167).
 *
 * Repoint, never replace: the existing primary row is updated in place so its id
 * survives, and a product that has never had an image gets exactly one row. The
 * superseded object stays in storage — immutable keys are the whole reason no
 * CDN purge is needed, and cleaning them up is #174.
 *
 * Non-primary rows are left alone rather than cleared. None exist today (the
 * seed writes one image per product), but multi-image management is #173 and
 * this must not quietly destroy its data when it arrives.
 *
 * `alt` falls back to the product's own name, which is why the name is selected
 * here: ProductImage.alt is non-null, and an empty alt on a storefront image is
 * an accessibility defect rather than a tidy default.
 */
export async function setPrimaryProductImage(
  vendorId: string,
  productId: string,
  storageKey: string,
  alt: string,
): Promise<CatalogueWriteResult> {
  const prisma = getPrisma();
  return await prisma.$transaction(async (tx) => {
    // Vendor-scoped: another vendor's product is indistinguishable from one that
    // never existed, exactly as updateProductForVendor treats it.
    const product = await tx.product.findFirst({
      where: { id: productId, vendorId },
      select: { id: true, name: true },
    });
    if (!product) return { ok: false as const, error: "That product no longer exists." };

    const altText = alt.trim() === "" ? product.name : alt.trim();
    const existing = await tx.productImage.findFirst({
      where: { productId, isPrimary: true },
      select: { id: true },
    });

    if (existing) {
      await tx.productImage.update({
        where: { id: existing.id },
        data: { storageKey, alt: altText },
      });
    } else {
      await tx.productImage.create({
        data: { productId, storageKey, alt: altText, isPrimary: true, sortOrder: 0 },
      });
    }

    return { ok: true as const, id: productId };
  });
}

/**
 * Fast-path for shop-floor staff to increment/decrement stock and toggle availability
 * without needing the full product edit payload (P6, #168).
 */
export async function quickUpdateInventory(
  vendorId: string,
  productId: string,
  data: { quantity?: number; isActive?: boolean },
): Promise<CatalogueWriteResult> {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id: productId, vendorId },
        select: { id: true, inventory: { select: { quantity: true, lowStockThreshold: true } } },
      });
      if (!existing) return { ok: false as const, error: "That product no longer exists." };

      if (data.isActive !== undefined) {
        await tx.product.update({
          where: { id: productId },
          data: { isActive: data.isActive },
        });
      }

      if (data.quantity !== undefined) {
        await tx.inventory.upsert({
          where: { productId, vendorId },
          create: {
            vendorId,
            productId,
            quantity: data.quantity,
            lowStockThreshold: 3,
          },
          update: { quantity: data.quantity },
        });
      }

      return { ok: true as const, id: productId };
    });
  } catch (error) {
    throw error;
  }
}
