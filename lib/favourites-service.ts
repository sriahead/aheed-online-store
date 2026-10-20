import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  listFavouriteProductIds,
  listFavouriteProducts,
  toggleFavourite,
  type FavouriteRepository,
} from "@/lib/repositories/favourites";

/**
 * Request-scoped wrapper around `lib/repositories/favourites.ts`'s pure functions (#232) —
 * resolves a live Prisma client and the current vendor, both of which need a real Workers request.
 *
 * Lives beside, not inside, `lib/repositories/`, matching `lib/reviews-service.ts` and
 * `lib/shopping-lists-service.ts`. `tests/repository-purity.test.ts` is what stops this shape
 * drifting back into the repository directory, where it would break the "importable from a plain
 * script" property for every export in that file rather than just this one.
 *
 * EVERY METHOD TAKES `userId` RATHER THAN READING THE SESSION. Favourites are authenticated-only,
 * and the caller has already had to establish who the shopper is in order to decide whether to
 * render a toggle at all — so resolving it a second time here would be a second source of truth
 * about identity. `features/favourites/toggle-favourite.ts` is the one place that reads the session.
 *
 * Constructed fresh per call, never cached across requests: caching a wrapper around request state
 * pins the first request's clients inside it.
 *
 * All of it rides `getPrisma()`. Nothing in the repository opens an implicit transaction, so there
 * is no `getPrismaWs()` here — see that file's docstring before changing it.
 */
export function getFavouritesRepository(): FavouriteRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async listProducts(userId) {
      return listFavouriteProducts(prisma, await vendorId(), userId);
    },

    async listProductIds(userId) {
      return listFavouriteProductIds(prisma, await vendorId(), userId);
    },

    async toggle(userId, productId) {
      return toggleFavourite(prisma, await vendorId(), userId, productId);
    },
  };
}
