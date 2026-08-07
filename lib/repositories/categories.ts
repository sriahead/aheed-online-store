import { getPrisma } from "@/lib/db";

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
}

export interface CategoryWithChildren extends CategorySummary {
  children: CategorySummary[];
}

export interface CategoryRepository {
  listTopLevel(): Promise<CategorySummary[]>;
  getBySlug(slug: string): Promise<CategoryWithChildren | null>;
}

/**
 * Prisma-backed CategoryRepository. Constructed fresh per call, never cached
 * across requests — matches lib/db.ts's getPrisma() contract on Workers.
 */
export function getCategoryRepository(): CategoryRepository {
  const prisma = getPrisma();

  return {
    async listTopLevel() {
      return prisma.category.findMany({
        where: { parentId: null, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, name: true },
      });
    },

    async getBySlug(slug) {
      return prisma.category.findFirst({
        where: { slug, isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            select: { id: true, slug: true, name: true },
          },
        },
      });
    },
  };
}
