import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  deleteReviewLink,
  listActiveReviewLinks,
  listAllReviewLinks,
  upsertReviewLink,
  type ReviewLink,
  type ReviewLinkInput,
} from "@/lib/repositories/vendor-review-links";

/**
 * Request-scoped wrapper around `lib/repositories/vendor-review-links.ts` (P9.2, #818).
 *
 * Every operation is a read or a singular write with no nested writes, so the HTTP client is
 * correct throughout and no websocket client appears here. Constructed fresh per call.
 */
export interface VendorReviewLinkRepository {
  listActive(): Promise<ReviewLink[]>;
  listAll(): Promise<ReviewLink[]>;
  upsert(input: ReviewLinkInput): Promise<void>;
  remove(linkId: string): Promise<number>;
}

export function getVendorReviewLinkRepository(): VendorReviewLinkRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async listActive() {
      return listActiveReviewLinks(prisma, await vendorId());
    },

    async listAll() {
      return listAllReviewLinks(prisma, await vendorId());
    },

    async upsert(input) {
      return upsertReviewLink(prisma, await vendorId(), input);
    },

    async remove(linkId) {
      return deleteReviewLink(prisma, await vendorId(), linkId);
    },
  };
}
