import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  eraseVendorData,
  exportPersonalData,
  getAccountProviders,
  hasVendorMembership,
  updateDisplayName,
  type EraseResult,
  type PersonalDataExport,
} from "@/lib/repositories/data-rights";

/**
 * Request-scoped wrapper around lib/repositories/data-rights.ts's pure
 * functions (P7b, #216) — resolves a live Prisma client and the current
 * vendor, which needs a real Workers request.
 *
 * Lives beside, not inside, lib/repositories/ for the same reason
 * lib/auth-rbac.ts does: lib/repositories/data-rights.ts's whole point is
 * that every export there takes `prisma` and the vendor explicitly and reads
 * no request context, so `scripts/verify-data-rights.ts` can import it from
 * plain `tsx` and prove the erasure transaction's atomicity and cross-vendor
 * isolation. A request-context resolver added to that file would be a second
 * entry point into the same exports, true of some of them and not others.
 * Splitting it out here keeps the property true of the whole module, not
 * "true except for this one function."
 *
 * `features/` and `app/` cannot import `@/lib/db` directly (ADR-004 slice-2
 * lint guard), so this file is the one place that does, on their behalf.
 *
 * Sync, like the other repository factories (`getCartRepository` et al.) —
 * `getPrisma()` resolves immediately; only the vendor id is lazy, memoized
 * behind a promise the same way `getCartRepository` does it.
 *
 * Constructed fresh per call, never cached across requests — a cached client
 * throws "Cannot perform I/O on behalf of a different request" on Workers
 * (CLAUDE.md), and caching this wrapper would pin the first request's client
 * inside it just the same.
 */
export interface DataRightsRepository {
  exportForCurrentVendor(userId: string): Promise<PersonalDataExport>;
  eraseForCurrentVendor(userId: string): Promise<EraseResult>;
  updateDisplayName(userId: string, name: string): Promise<void>;
  hasVendorMembership(userId: string): Promise<boolean>;
  getAccountProviders(userId: string): Promise<string[]>;
}

export function getDataRightsRepository(): DataRightsRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async exportForCurrentVendor(userId) {
      return exportPersonalData(prisma, await vendorId(), userId);
    },
    async eraseForCurrentVendor(userId) {
      // The WebSocket client, strictly for this transaction: PrismaNeonHttp
      // cannot run interactive transactions, and a half-applied erasure is the
      // one outcome there is no way to recover from.
      return eraseVendorData(getPrismaWs(), await vendorId(), userId);
    },
    async updateDisplayName(userId, name) {
      return updateDisplayName(prisma, userId, name);
    },
    async hasVendorMembership(userId) {
      return hasVendorMembership(prisma, userId);
    },
    async getAccountProviders(userId) {
      return getAccountProviders(prisma, userId);
    },
  };
}
