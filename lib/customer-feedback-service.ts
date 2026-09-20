import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  getApprovedFeedbackSummary,
  getOwnFeedback,
  hasCompletedOrder,
  listApprovedFeedback,
  listFeedbackForModeration,
  setFeedbackStatus,
  setFeedbackStatusBulk,
  upsertCustomerFeedback,
  type FeedbackSummary,
  type ModerationFeedback,
  type OwnFeedback,
  type PublicFeedback,
  type UpsertFeedbackInput,
} from "@/lib/repositories/customer-feedback";

/**
 * Request-scoped wrapper around `lib/repositories/customer-feedback.ts` (P9.2, #818) —
 * resolves a live Prisma client and the current vendor, both of which need a real Workers
 * request. Lives beside, not inside, `lib/repositories/`, matching `lib/reviews-service.ts`
 * and `lib/data-rights-service.ts`.
 *
 * CLIENT CHOICE IS THE THING TO GET RIGHT HERE. Every read and every single-row write takes
 * `getPrisma()` (HTTP). `approveMany` — the only `updateMany` in this feature — takes
 * `getPrismaWs()`, because `updateMany` over the HTTP adapter crashes unconditionally, even
 * matching zero rows. Nothing in `build`, `typecheck` or `test` can catch that; only running
 * it against a real database does, which is what
 * `scripts/verify-customer-feedback.ts --bulk-approve` is for.
 *
 * Constructed fresh per call, never cached across requests (CLAUDE.md).
 */
export interface CustomerFeedbackRepository {
  upsertOwn(userId: string, input: UpsertFeedbackInput): Promise<void>;
  getOwn(userId: string): Promise<OwnFeedback | null>;
  listApproved(take: number): Promise<PublicFeedback[]>;
  approvedSummary(): Promise<FeedbackSummary>;
  listForModeration(take: number): Promise<ModerationFeedback[]>;
  moderate(
    feedbackId: string,
    status: "PENDING" | "APPROVED" | "REJECTED",
    moderatorId: string,
    moderationNote: string | null,
  ): Promise<boolean>;
  approveMany(feedbackIds: string[], moderatorId: string): Promise<number>;
  customerHasCompletedOrder(userId: string): Promise<boolean>;
}

export function getCustomerFeedbackRepository(): CustomerFeedbackRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async upsertOwn(userId, input) {
      return upsertCustomerFeedback(prisma, await vendorId(), userId, input);
    },

    async getOwn(userId) {
      return getOwnFeedback(prisma, await vendorId(), userId);
    },

    async listApproved(take) {
      return listApprovedFeedback(prisma, await vendorId(), take);
    },

    async approvedSummary() {
      return getApprovedFeedbackSummary(prisma, await vendorId());
    },

    async listForModeration(take) {
      return listFeedbackForModeration(prisma, await vendorId(), take);
    },

    async moderate(feedbackId, status, moderatorId, moderationNote) {
      return setFeedbackStatus(
        prisma,
        await vendorId(),
        feedbackId,
        status,
        moderatorId,
        moderationNote,
      );
    },

    async approveMany(feedbackIds, moderatorId) {
      // getPrismaWs(), not `prisma` — see the client-choice note above.
      return setFeedbackStatusBulk(getPrismaWs(), await vendorId(), feedbackIds, moderatorId);
    },

    async customerHasCompletedOrder(userId) {
      return hasCompletedOrder(prisma, await vendorId(), userId);
    },
  };
}
