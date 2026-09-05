import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { slugify } from "@/lib/catalogue-form";
import {
  createBrandForVendor,
  getBrandBySlug,
  listBrandsForAdmin as listBrandsForAdminRepo,
  listBrandSummaries as listBrandSummariesRepo,
  renameBrandForVendor,
  setBrandImageKey as setBrandImageKeyRepo,
  type BrandRepository,
} from "@/lib/repositories/brands";

/**
 * Request-scoped wrapper around `lib/repositories/brands.ts`'s pure functions (#252) — resolves a
 * live Prisma client and the current vendor, both of which need a real Workers request.
 *
 * Lives beside, not inside, `lib/repositories/` for the reason `lib/categories-service.ts` and
 * `lib/products-service.ts` already do: the repository module's defining property is that every
 * export takes `prisma` and `vendorId` explicitly and reads no request context, so a plain `tsx`
 * script can import it in real Node. A context-resolving factory in that file would make the
 * property true of some exports and not others.
 *
 * Both clients are constructed fresh per call and never cached across requests — a cached client
 * throws "Cannot perform I/O on behalf of a different request" on Workers, and caching this
 * wrapper would pin the first request's clients inside it just the same. `getPrismaWs()` is only
 * reached by the two `updateMany` writers; see the repository's header for why they cannot use the
 * HTTP client.
 */
export function getBrandRepository(): BrandRepository {
  const prisma = getPrisma();
  const prismaWs = getPrismaWs();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async listForAdmin() {
      return listBrandsForAdminRepo(prisma, await vendorId());
    },
    async listSummaries() {
      return listBrandSummariesRepo(prisma, await vendorId());
    },
    async getBySlug(slug: string) {
      return getBrandBySlug(prisma, await vendorId(), slug);
    },
    async create(name: string) {
      // Slug derived here, not in the repository: `slugify` is the shared form helper, so a brand's
      // slug follows the same rules a product's and a category's already do.
      return createBrandForVendor(prisma, await vendorId(), { name, slug: slugify(name) });
    },
    async rename(id: string, name: string) {
      return renameBrandForVendor(prismaWs, await vendorId(), { id, name });
    },
    async setImageKey(id: string, imageKey: string | null) {
      return setBrandImageKeyRepo(prismaWs, await vendorId(), { id, imageKey });
    },
  };
}
