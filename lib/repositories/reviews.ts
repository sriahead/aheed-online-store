import { getPrisma } from "@/lib/db";

export interface ReviewSummary {
  id: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  reviewerName: string;
}

export interface ReviewInput {
  rating: number;
  comment: string | null;
}

export interface ReviewRepository {
  upsert(userId: string, productId: string, rating: number, comment: string | null): Promise<void>;
  delete(reviewId: string, userId: string): Promise<void>;
  listByProduct(productId: string, take: number): Promise<ReviewSummary[]>;
  getByUserAndProduct(userId: string, productId: string): Promise<ReviewInput | null>;
}

/**
 * Prisma-backed ReviewRepository. Constructed fresh per call, never cached
 * across requests — matches lib/db.ts's getPrisma() contract on Workers.
 */
export function getReviewRepository(): ReviewRepository {
  const prisma = getPrisma();

  return {
    async upsert(userId, productId, rating, comment) {
      // Full aggregate recompute, not incremental — avoids floating-point
      // drift, matches Inventory.quantity's denormalized-and-recomputed
      // precedent. Both writes share one transaction.
      await prisma.$transaction(async (tx) => {
        await tx.review.upsert({
          where: { userId_productId: { userId, productId } },
          create: { userId, productId, rating, comment },
          update: { rating, comment },
        });

        const agg = await tx.review.aggregate({
          where: { productId },
          _avg: { rating: true },
          _count: true,
        });
        await tx.product.update({
          where: { id: productId },
          data: { averageRating: agg._avg.rating ?? 0, reviewCount: agg._count },
        });
      });
    },

    async delete(reviewId, userId) {
      await prisma.$transaction(async (tx) => {
        const review = await tx.review.findUnique({
          where: { id: reviewId },
          select: { productId: true },
        });
        if (!review) return;

        // Ownership check baked into the delete itself (atomic, no
        // read-then-check gap) — deleting another user's review is a
        // silent no-op (count: 0), not an error.
        const { count } = await tx.review.deleteMany({ where: { id: reviewId, userId } });
        if (count === 0) return;

        const agg = await tx.review.aggregate({
          where: { productId: review.productId },
          _avg: { rating: true },
          _count: true,
        });
        await tx.product.update({
          where: { id: review.productId },
          data: { averageRating: agg._avg.rating ?? 0, reviewCount: agg._count },
        });
      });
    },

    async listByProduct(productId, take) {
      const rows = await prisma.review.findMany({
        where: { productId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: {
          id: true,
          userId: true,
          rating: true,
          comment: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      });

      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        reviewerName: r.user.name,
      }));
    },

    async getByUserAndProduct(userId, productId) {
      const review = await prisma.review.findUnique({
        where: { userId_productId: { userId, productId } },
        select: { rating: true, comment: true },
      });
      return review;
    },
  };
}
