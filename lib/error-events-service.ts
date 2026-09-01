import { getPrisma } from "@/lib/db";
import { listRecentErrorEvents } from "@/lib/repositories/error-events";

/** Request-scoped wrapper (#508), matching this codebase's page -> service -> repository
 *  layering — `ErrorEvent` carries no vendor, so there is no request context to resolve beyond
 *  a fresh Prisma client. */
export async function getRecentErrorEvents(limit: number) {
  return listRecentErrorEvents(getPrisma(), limit);
}
