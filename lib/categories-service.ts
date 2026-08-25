import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  getCategoryBySlug,
  listTopLevelCategories,
  type CategoryRepository,
} from "@/lib/repositories/categories";

/**
 * Request-scoped wrapper around `lib/repositories/categories.ts`'s pure reads
 * (#252) — resolves a live Prisma client and the current vendor, both of which
 * need a real Workers request.
 *
 * Lives beside, not inside, `lib/repositories/` for the reason
 * `lib/data-rights-service.ts` and `lib/products-service.ts` already do: the
 * repository module's defining property is that every export takes `prisma` and
 * `vendorId` explicitly and reads no request context, so a plain `tsx` script
 * can import it in real Node. A context-resolving factory in that file would
 * make the property true of some exports and not others.
 * `tests/repository-purity.test.ts` is what enforces the location.
 *
 * Constructed fresh per call, never cached across requests — a cached client
 * throws "Cannot perform I/O on behalf of a different request" on Workers
 * (CLAUDE.md), and caching this wrapper would pin the first request's client
 * inside it just the same.
 */
export function getCategoryRepository(): CategoryRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async listTopLevel() {
      return listTopLevelCategories(prisma, await vendorId());
    },

    async getBySlug(slug) {
      return getCategoryBySlug(prisma, await vendorId(), slug);
    },
  };
}
