import { getPrisma } from "@/lib/db";
import {
  listRecentErrorEvents,
  recordErrorEvent,
  type RecordErrorEventInput,
} from "@/lib/repositories/error-events";

/** Request-scoped wrapper (#508), matching this codebase's page -> service -> repository
 *  layering — `ErrorEvent` carries no vendor, so there is no request context to resolve beyond
 *  a fresh Prisma client. */
export async function getRecentErrorEvents(limit: number) {
  return listRecentErrorEvents(getPrisma(), limit);
}

/** #1016 — the same write `instrumentation.ts` makes, for a degradation caught without a throw. */
export async function recordHandledErrorEvent(input: RecordErrorEventInput): Promise<void> {
  await recordErrorEvent(getPrisma(), input);
}
