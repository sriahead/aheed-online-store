import { getPrisma } from "@/lib/db";
import {
  listRecentErrorEvents,
  recordErrorEvent,
  type RecordErrorEventInput,
} from "@/lib/repositories/error-events";
import { markErrorEvent } from "@/lib/job-signals";

/** Request-scoped wrapper (#508), matching this codebase's page -> service -> repository
 *  layering — `ErrorEvent` carries no vendor, so there is no request context to resolve beyond
 *  a fresh Prisma client. */
export async function getRecentErrorEvents(limit: number) {
  return listRecentErrorEvents(getPrisma(), limit);
}

/**
 * #1016 — the same write `instrumentation.ts` makes, for a degradation caught without a throw.
 *
 * #1324 — also marks the error for the scheduler, in `finally` so a failed write is marked too:
 * a database outage is exactly when the error-rate check most needs to run.
 */
export async function recordHandledErrorEvent(input: RecordErrorEventInput): Promise<void> {
  try {
    await recordErrorEvent(getPrisma(), input);
  } finally {
    await markErrorEvent(new Date());
  }
}
