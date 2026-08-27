import { getPrisma } from "@/lib/db";
import { listCustomersForAdmin, type AdminCustomerPage } from "@/lib/repositories/customers";

/**
 * Request-scoped entry point for the staff customer directory (#409).
 *
 * Lives beside, not inside, `lib/repositories/customers.ts` so that module's
 * every export keeps taking `prisma` and `vendorId` explicitly and can be run
 * from a plain `tsx` script. `tests/repository-client-injection.test.ts` enforces
 * the client half of that rule; `tests/repository-purity.test.ts` the
 * request-context half.
 *
 * Takes `vendorId` rather than resolving it: every caller already holds an
 * authoritative one from `requireVendorRole`, which derives it from the request
 * host. Re-resolving here would add a second source of truth for something the
 * caller established more strongly. Same posture as `lib/roles-service.ts`.
 *
 * Constructs Prisma inside the function, never at module scope — a client cached
 * across requests throws "Cannot perform I/O on behalf of a different request" on
 * Workers (CLAUDE.md).
 */
export async function listCustomersForVendor(
  vendorId: string,
  options: { take: number; page: number },
): Promise<AdminCustomerPage> {
  return listCustomersForAdmin(getPrisma(), vendorId, options);
}
