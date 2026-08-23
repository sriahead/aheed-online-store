import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  addCartItem,
  addCartItems,
  applyCartMerge,
  getCartId,
  getCartSummary,
  isGuestCartGone,
  removeCartItem,
  setCartQuantity,
  type CartRepository,
} from "@/lib/repositories/cart";

/**
 * Request-scoped wrapper around `lib/repositories/cart.ts`'s pure functions
 * (#252) — resolves a live Prisma client and the current vendor, both of which
 * need a real Workers request.
 *
 * Lives beside, not inside, `lib/repositories/`, matching
 * `lib/data-rights-service.ts` and `lib/promotions-service.ts`. The repository
 * module's cart-merge and stock-clamp behaviour is what a plain `tsx` script
 * needs to be able to exercise, which is only possible while every export there
 * takes its client and `vendorId` explicitly.
 * `tests/repository-purity.test.ts` enforces the location.
 *
 * `getPrismaWs()` is called at each write's call site rather than once up
 * front, so a read-only request never constructs a WebSocket client — CLAUDE.md's
 * hybrid strategy, and what keeps this off the 50-socket-per-isolate ceiling.
 *
 * Constructed fresh per call, never cached across requests.
 */
export function getCartRepository(): CartRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async getSummary(identity) {
      return getCartSummary(prisma, await vendorId(), identity);
    },

    async addItem(identity, productId, delta = 1) {
      return addCartItem(prisma, getPrismaWs(), await vendorId(), identity, productId, delta);
    },

    async addItems(identity, lines) {
      return addCartItems(prisma, getPrismaWs(), await vendorId(), identity, lines);
    },

    async setQuantity(identity, productId, quantity) {
      return setCartQuantity(
        prisma,
        getPrismaWs(),
        await vendorId(),
        identity,
        productId,
        quantity,
      );
    },

    async removeItem(identity, productId) {
      return removeCartItem(prisma, getPrismaWs(), await vendorId(), identity, productId);
    },

    async applyMerge(identity, resolution) {
      return applyCartMerge(prisma, getPrismaWs(), await vendorId(), identity, resolution);
    },

    async isGuestCartGone(identity) {
      return isGuestCartGone(prisma, await vendorId(), identity);
    },

    async getCartId(identity) {
      return getCartId(prisma, await vendorId(), identity);
    },
  };
}
