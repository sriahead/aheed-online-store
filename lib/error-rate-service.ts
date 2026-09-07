import { getPrisma } from "@/lib/db";
import { countRecentErrorEvents } from "@/lib/repositories/error-events";
import { ERROR_RATE_WINDOW_MS, evaluateErrorRate, type ErrorRateSummary } from "@/lib/error-rate";

/**
 * The request-scoped facade for the error-rate check (P9.2, #437 code tail).
 *
 * Exists for the same reason `lib/payment-sweep-service.ts` and
 * `lib/guest-cart-reaper-service.ts` do: `app/` may not import `@/lib/db`
 * (`no-restricted-imports`, ADR-004 slice 2), the repository function stays pure
 * and takes its client explicitly, and `lib/error-rate.ts` stays free of every
 * runtime import so its decision can be unit-tested with no stubs at all.
 *
 * Constructed fresh per call, never cached: a cached Prisma client pins the
 * first request's I/O objects and throws "Cannot perform I/O on behalf of a
 * different request" on Workers.
 */
export function getErrorRateService() {
  return {
    check: async (now: Date = new Date()): Promise<ErrorRateSummary> => {
      const prisma = getPrisma();
      const since = new Date(now.getTime() - ERROR_RATE_WINDOW_MS);
      const count = await countRecentErrorEvents(prisma, since);
      return evaluateErrorRate(count, since);
    },
  };
}
