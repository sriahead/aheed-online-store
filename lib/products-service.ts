import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  getAvailableSpecialities,
  getProductBySlug,
  listProducts,
  listCategorySpotlights,
  listProductsByCategory,
  matchProductListTerms,
  searchProducts,
  type ProductRepository,
} from "@/lib/repositories/products";

/**
 * Request-scoped wrapper around `lib/repositories/products.ts`'s pure reads
 * (#252) — resolves a live Prisma client and the current vendor, both of which
 * need a real Workers request.
 *
 * Lives beside, not inside, `lib/repositories/`, matching
 * `lib/data-rights-service.ts` and `lib/categories-service.ts`. The repository
 * module's admin write path takes `vendorId` explicitly for the same reason
 * these reads now do, so a plain `tsx` script can exercise either without a
 * live Workers request. `tests/repository-purity.test.ts` enforces the
 * location.
 *
 * Constructed fresh per call, never cached across requests.
 */
export function getProductRepository(): ProductRepository {
  const prisma = getPrisma();
  // Resolve the current vendor once per repository instance (request-scoped);
  // never cached across requests. Every query below is scoped to it (ADR-004 slice 2).
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async listByCategory(categoryId, opts) {
      return listProductsByCategory(prisma, await vendorId(), categoryId, opts);
    },

    async list(opts) {
      return listProducts(prisma, await vendorId(), opts);
    },

    async search(query, opts) {
      return searchProducts(prisma, await vendorId(), query, opts);
    },

    async getBySlug(slug) {
      return getProductBySlug(prisma, await vendorId(), slug);
    },

    async availableSpecialities() {
      return getAvailableSpecialities(prisma, await vendorId());
    },

    async matchListTerms(terms) {
      return matchProductListTerms(prisma, await vendorId(), terms);
    },

    async categorySpotlights(categoryIds) {
      return listCategorySpotlights(prisma, await vendorId(), categoryIds);
    },
  };
}
