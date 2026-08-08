import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";

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
  // Resolve the current vendor once per repository instance (request-scoped);
  // never cached across requests. Every query below is scoped to it (ADR-004 slice 2).
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async listTopLevel() {
      return prisma.category.findMany({
        where: { vendorId: await vendorId(), parentId: null, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, name: true },
      });
    },

    async getBySlug(slug) {
      const vid = await vendorId();
      return prisma.category.findFirst({
        where: { vendorId: vid, slug, isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          children: {
            where: { vendorId: vid, isActive: true },
            orderBy: { sortOrder: "asc" },
            select: { id: true, slug: true, name: true },
          },
        },
      });
    },
  };
}
