import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  getBalance,
  getLoyaltyConfig,
  getTiers,
  listLedgerForUser,
  windowSpendPence,
  type LedgerRow,
  type LoyaltyBalance,
  type LoyaltyConfig,
} from "@/lib/repositories/loyalty";
import type { LoyaltyTier } from "@/lib/loyalty";

/**
 * Request-scoped read facade for the account page (#252) — resolves prisma and
 * the current vendor so the app layer never touches `lib/db`.
 *
 * Lives beside, not inside, `lib/repositories/loyalty.ts`: that module's
 * concurrency and idempotency guarantees are its most important properties and
 * can only be proven from a plain `tsx` script because every export there takes
 * its client and `vendorId` explicitly. `tests/repository-purity.test.ts`
 * enforces the location.
 *
 * Not to be confused with `lib/loyalty.ts`, which holds the pure points rules
 * and touches no database.
 *
 * Constructed fresh per call, never cached across requests.
 */
export function getLoyaltyRepository() {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async config(): Promise<LoyaltyConfig> {
      return getLoyaltyConfig(prisma, await vendorId());
    },

    async tiers(): Promise<LoyaltyTier[]> {
      return getTiers(prisma, await vendorId());
    },

    async balance(userId: string, config: LoyaltyConfig): Promise<LoyaltyBalance> {
      return getBalance(prisma, await vendorId(), userId, config);
    },

    async windowSpend(userId: string, tierWindowDays: number): Promise<number> {
      return windowSpendPence(prisma, await vendorId(), userId, tierWindowDays);
    },

    /** This vendor's entries for this user only, newest first. */
    async ledger(userId: string): Promise<LedgerRow[]> {
      return listLedgerForUser(prisma, await vendorId(), userId);
    },
  };
}
