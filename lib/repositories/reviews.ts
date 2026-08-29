import type { getPrisma, getPrismaWs } from "@/lib/db";

/**
 * Product reviews (P2.5a) — the ONLY DB access for reviews. Pages, components
 * and feature actions reach these through `lib/reviews-service.ts`'s
 * request-scoped wrapper (ADR-004 slice-2 no-direct-Prisma guard).
 *
 * THE `@/lib/db` IMPORT IS TYPE-ONLY, DELIBERATELY — matching
 * `lib/repositories/categories.ts` and `lib/repositories/data-rights.ts`.
 * `lib/db.ts` imports PrismaClient from `@prisma/client/wasm`, the workerd-safe
 * loader, which a plain Node process should not pull in. Every function here
 * takes its client as an argument, so a runtime import would buy nothing and
 * would stop a `tsx` script from loading this module at all.
 *
 * EVERY EXPORTED FUNCTION takes its client (and `vendorId` where the query is
 * vendor-scoped) as EXPLICIT arguments and reads no request context — no
 * `getCurrentVendorId()`, no `headers()`, no `getAuth()`. That is why the
 * request-scoped facade lives in `lib/reviews-service.ts` instead of here
 * (#252); `tests/repository-purity.test.ts` is what enforces it.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;

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
 * Write (or replace) this user's review of this product, recomputing the
 * product's aggregate in the same transaction.
 *
 * Always the WEBSOCKET client — `PrismaNeonHttp` cannot run an interactive
 * transaction, and a half-applied review would leave the aggregate lying.
 */
export async function upsertReview(
  prismaWs: DbWs,
  vendorId: string,
  userId: string,
  productId: string,
  rating: number,
  comment: string | null,
): Promise<void> {
  // Full aggregate recompute, not incremental — avoids floating-point
  // drift, matches Inventory.quantity's denormalized-and-recomputed
  // precedent. Both writes share one transaction.
  await prismaWs.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, vendorId },
      select: { vendorId: true },
    });
    if (!product) throw new Error("Product not found");

    await tx.review.upsert({
      where: {
        vendorId_userId_productId: { vendorId: product.vendorId, userId, productId },
      },
      create: { vendorId: product.vendorId, userId, productId, rating, comment },
      update: { rating, comment },
    });

    const agg = await tx.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: true,
    });
    await tx.product.update({
      where: { id: productId, vendorId },
      data: { averageRating: agg._avg.rating ?? 0, reviewCount: agg._count },
    });
  });
}

/**
 * Delete this user's own review, recomputing the product's aggregate in the
 * same transaction. Deleting someone else's review is a silent no-op.
 */
export async function deleteReview(
  prismaWs: DbWs,
  vendorId: string,
  reviewId: string,
  userId: string,
): Promise<void> {
  await prismaWs.$transaction(async (tx) => {
    const review = await tx.review.findFirst({
      where: { id: reviewId, vendorId },
      select: { productId: true },
    });
    if (!review) return;

    // Ownership check baked into the delete itself (atomic, no
    // read-then-check gap) — deleting another user's review is a
    // silent no-op (count: 0), not an error.
    const { count } = await tx.review.deleteMany({ where: { id: reviewId, userId, vendorId } });
    if (count === 0) return;

    const agg = await tx.review.aggregate({
      where: { productId: review.productId },
      _avg: { rating: true },
      _count: true,
    });
    await tx.product.update({
      where: { id: review.productId, vendorId },
      data: { averageRating: agg._avg.rating ?? 0, reviewCount: agg._count },
    });
  });
}

export async function listReviewsByProduct(
  prisma: Db,
  vendorId: string,
  productId: string,
  take: number,
): Promise<ReviewSummary[]> {
  const rows = await prisma.review.findMany({
    where: { vendorId, productId },
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
}

export async function getReviewByUserAndProduct(
  prisma: Db,
  vendorId: string,
  userId: string,
  productId: string,
): Promise<ReviewInput | null> {
  // (userId, productId) is still effectively unique — a product belongs to exactly one
  // vendor, so vendorId is functionally determined — so findFirst returns the one row
  // without needing the composite key.
  return prisma.review.findFirst({
    where: { vendorId, userId, productId },
    select: { rating: true, comment: true },
  });
}
