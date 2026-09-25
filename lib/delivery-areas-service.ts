import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  createDeliveryAreaForVendor,
  createDeliveryAreasForVendor,
  listDeliveryAreasForVendor,
  removeDeliveryAreaForVendor,
  updateDeliveryAreaChargesForVendor,
  type DeliveryAreaRepository,
} from "@/lib/repositories/delivery-areas";

/**
 * Request-scoped wrapper around `lib/repositories/delivery-areas.ts`'s pure functions (#252, #612)
 * — resolves a live Prisma client and the current vendor, both of which need a real Workers
 * request.
 *
 * Lives beside, not inside, `lib/repositories/` for the reason `lib/brands-service.ts` and
 * `lib/vendor-service.ts` already do: the repository module's defining property is that every
 * export takes `prisma` and `vendorId` explicitly and reads no request context, so a plain `tsx`
 * script can import it in real Node. A context-resolving factory in that file would make the
 * property true of some exports and not others — and `tests/repository-purity.test.ts` would fail
 * on the `@/lib/tenant` import below.
 *
 * Both clients are constructed fresh per call and never cached across requests — a cached client
 * throws "Cannot perform I/O on behalf of a different request" on Workers, and caching this wrapper
 * would pin the first request's clients inside it just the same. `getPrismaWs()` is reached by
 * `createMany` and `updateCharges` (`createMany`/`updateMany` crash over HTTP, #382) and by `remove`
 * (its last-area guard is an interactive transaction); see the repository's header.
 */
export function getDeliveryAreaRepository(): DeliveryAreaRepository {
  const prisma = getPrisma();
  const prismaWs = getPrismaWs();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async list() {
      return listDeliveryAreasForVendor(prisma, await vendorId());
    },
    async create(prefix, charges) {
      return createDeliveryAreaForVendor(prisma, await vendorId(), prefix, charges);
    },
    async createMany(prefixes, charges) {
      return createDeliveryAreasForVendor(prismaWs, await vendorId(), prefixes, charges);
    },
    async updateCharges(id, charges) {
      return updateDeliveryAreaChargesForVendor(prismaWs, await vendorId(), id, charges);
    },
    async remove(id: string) {
      return removeDeliveryAreaForVendor(prismaWs, await vendorId(), id);
    },
  };
}
