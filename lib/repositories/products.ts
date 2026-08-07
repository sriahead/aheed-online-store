import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db";

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
}

export interface ProductDetail extends ProductSummary {
  description: string;
  images: ProductImageSummary[];
  inStock: boolean;
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
        images: { where: { isPrimary: true }, take: 1, select: productImageSelect },
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
        primaryImage: p.images[0] ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  return {
    async listByCategory(categoryId, { take, cursor, ...filters }) {
      return findPage(
        { categoryId, isActive: true, ...buildFilterWhere(filters) },
        { take, cursor },
      );
    },

    async search(query, { take, cursor, ...filters }) {
      const trimmed = query.trim();
      if (!trimmed) return { items: [], nextCursor: null };

      return findPage(
        {
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
        where: { slug, isActive: true },
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
  };
}
