import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { listCodes, type CodeListRow } from "@/lib/repositories/discounts";

/**
 * Request-scoped read facade for the discount-code admin pages (#252).
 *
 * Lives beside, not inside, `lib/repositories/discounts.ts`: that module's
 * concurrency guarantees are its most important property, and they can only be
 * proven from a plain `tsx` script because every export there takes `prisma`
 * and `vendorId` explicitly. A context-resolving factory in the same file would
 * be a second entry point into those exports and would break the property for
 * the whole module. `tests/repository-purity.test.ts` enforces the location.
 *
 * Not to be confused with `lib/discounts.ts`, which holds the pure evaluation
 * rules and touches no database at all.
 *
 * Constructs Prisma fresh per call — a cached client cannot cross a Workers
 * request boundary (CLAUDE.md).
 */
export function getDiscountRepository() {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async list(): Promise<CodeListRow[]> {
      return listCodes(prisma, await vendorId());
    },
  };
}
