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

export interface ProductRepository {
  listByCategory(categoryId: string, opts: { take: number; cursor?: string }): Promise<ProductPage>;
  getBySlug(slug: string): Promise<ProductDetail | null>;
}

const productImageSelect = { storageKey: true, alt: true, isPrimary: true } as const;

/**
 * Prisma-backed ProductRepository. Constructed fresh per call, never cached
 * across requests — matches lib/db.ts's getPrisma() contract on Workers.
 */
export function getProductRepository(): ProductRepository {
  const prisma = getPrisma();

  return {
    async listByCategory(categoryId, { take, cursor }) {
      // Keyset (cursor) pagination on (createdAt, id) — never OFFSET, per
      // specs/architecture.md's pagination strategy. Over-fetch by one to
      // know whether a next page exists without a separate count query.
      const rows = await prisma.product.findMany({
        where: { categoryId, isActive: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          slug: true,
          name: true,
          basePrice: true,
          unitLabel: true,
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
          primaryImage: p.images[0] ?? null,
        })),
        nextCursor: hasMore ? page[page.length - 1].id : null,
      };
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
