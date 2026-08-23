import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  deleteReview,
  getReviewByUserAndProduct,
  listReviewsByProduct,
  upsertReview,
  type ReviewRepository,
} from "@/lib/repositories/reviews";

/**
 * Request-scoped wrapper around `lib/repositories/reviews.ts`'s pure functions
 * (#252) — resolves a live Prisma client and the current vendor, both of which
 * need a real Workers request.
 *
 * Lives beside, not inside, `lib/repositories/`, matching
 * `lib/data-rights-service.ts` and `lib/promotions-service.ts`. The write
 * methods take the WebSocket client because they are interactive transactions;
 * the reads take the fetch-based client (CLAUDE.md's hybrid strategy).
 *
 * Constructed fresh per call, never cached across requests.
 */
export function getReviewRepository(): ReviewRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async upsert(userId, productId, rating, comment) {
      return upsertReview(getPrismaWs(), userId, productId, rating, comment);
    },

    async delete(reviewId, userId) {
      return deleteReview(getPrismaWs(), reviewId, userId);
    },

    async listByProduct(productId, take) {
      return listReviewsByProduct(prisma, await vendorId(), productId, take);
    },

    async getByUserAndProduct(userId, productId) {
      return getReviewByUserAndProduct(prisma, await vendorId(), userId, productId);
    },
  };
}
