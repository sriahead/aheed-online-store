import { getPrisma } from "@/lib/db";
import { checkOrderLookupRateLimit } from "@/lib/repositories/order-lookup-rate-limit";

/**
 * Request-scoped entry point for the guest order-lookup throttle (#409).
 *
 * Lives beside, not inside, `lib/repositories/order-lookup-rate-limit.ts` so the
 * throttle itself keeps taking `prisma` explicitly and can be exercised against a
 * real database from a plain `tsx` script.
 *
 * That matters more here than anywhere else in this slice: this is a security
 * control, and while it resolved its own client it could not be tested outside a
 * live Workers request at all — `lib/db`'s client is built from
 * `@prisma/client/wasm`, whose query compiler Node cannot load. A rate limiter
 * nobody can run is a rate limiter nobody can prove.
 *
 * Resolves the client per call, never cached across requests (CLAUDE.md).
 */
export async function checkOrderLookupRateLimitForVendor(
  vendorId: string,
  ip: string,
): Promise<{ allowed: boolean }> {
  return checkOrderLookupRateLimit(getPrisma(), vendorId, ip);
}
