import { getPrisma } from "@/lib/db";
import { listActiveVendorIds } from "@/lib/repositories/vendor";
import {
  ABANDONED_GUEST_CART_RETENTION_MS,
  deleteAbandonedGuestCarts,
} from "@/lib/repositories/cart";

/**
 * The request-scoped facade for the abandoned guest-cart reaper (P9.2, #94).
 *
 * Exists because `app/` may not import `@/lib/db` — `eslint.config.mjs`'s
 * `no-restricted-imports` rule enforces ADR-004 slice 2, keeping the app layer
 * out of Prisma so vendor scoping cannot be bypassed by a route resolving its
 * own client. Same division of labour as `lib/payment-sweep-service.ts`: the
 * repository function stays pure and takes its client and `vendorId`
 * explicitly, this module resolves a live client, and the route above it holds
 * neither.
 *
 * Constructed fresh per call, never cached: a cached Prisma client pins the
 * first request's I/O objects and throws "Cannot perform I/O on behalf of a
 * different request" on Workers.
 */

/**
 * Deleted per vendor per tick, NOT across all vendors combined.
 *
 * A shared cap would let one vendor with a large backlog consume the whole
 * budget and starve every other vendor indefinitely — that is #619, an open
 * defect in the payment sweep's own batching, and there is no reason to
 * reproduce it in a second job. Bounded because a tick should be predictable,
 * not because the work is urgent: anything left is simply reaped on the next
 * one, fifteen minutes later.
 */
const PER_VENDOR_LIMIT = 500;

export interface GuestCartReapSummary {
  /** Active vendors swept on this tick. */
  vendors: number;
  /** Carts actually deleted, summed across those vendors. */
  deleted: number;
  /** The cutoff applied — carts untouched since this instant were eligible. */
  olderThan: string;
}

export function getGuestCartReaperService() {
  return {
    run: async (now: Date = new Date()): Promise<GuestCartReapSummary> => {
      // Read client only: the sweep is a `findMany` plus a `deleteMany`, and
      // `deleteMany` runs correctly on the HTTP adapter (#382 covers only
      // updateMany/createMany), so no WebSocket client is needed.
      const prisma = getPrisma();
      const olderThan = new Date(now.getTime() - ABANDONED_GUEST_CART_RETENTION_MS);

      const vendorIds = await listActiveVendorIds(prisma);

      let deleted = 0;
      // Sequential, matching the scheduler's own posture: the vendor list is
      // short and a flat, ordered load on the database keeps a tick's cost
      // predictable.
      for (const vendorId of vendorIds) {
        deleted += await deleteAbandonedGuestCarts(prisma, vendorId, olderThan, PER_VENDOR_LIMIT);
      }

      return { vendors: vendorIds.length, deleted, olderThan: olderThan.toISOString() };
    },
  };
}
