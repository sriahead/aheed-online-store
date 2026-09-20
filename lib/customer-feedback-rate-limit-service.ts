import { getPrisma } from "@/lib/db";
import {
  checkFeedbackWriteRateLimit,
  type FeedbackRateLimitResult,
} from "@/lib/repositories/customer-feedback-rate-limit";

/**
 * Request-scoped entry point for the feedback write throttle (P9.2, #818).
 *
 * Lives beside, not inside, `lib/repositories/customer-feedback-rate-limit.ts` for the same
 * reason `lib/order-lookup-rate-limit-service.ts` does (#409): the throttle itself keeps
 * taking `prisma` explicitly so it can be exercised against a real database from a plain
 * `tsx` script. That matters more here than almost anywhere else in this codebase — this is
 * a security control, and while a control resolves its own client it cannot be tested
 * outside a live Workers request at all, because `lib/db`'s client is built from
 * `@prisma/client/wasm`, whose query compiler Node cannot load.
 *
 * Resolves the client per call, never cached across requests (CLAUDE.md).
 */
export async function checkFeedbackWriteRateLimitForVendor(
  vendorId: string,
  ip: string,
  lastSubmittedAt: Date | null,
): Promise<FeedbackRateLimitResult> {
  return checkFeedbackWriteRateLimit(getPrisma(), vendorId, ip, lastSubmittedAt);
}
