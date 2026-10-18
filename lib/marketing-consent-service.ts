import { getPrisma } from "@/lib/db";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { marketingConsentStatement } from "@/lib/marketing-consent";
import {
  getMarketingConsentState,
  recordMarketingConsent,
  type MarketingConsentState,
} from "@/lib/repositories/marketing-consent";
import { setVendorMarketingConsentEnabled } from "@/lib/repositories/vendor";

/**
 * Request-scoped facade over `lib/repositories/marketing-consent.ts` (#1134): resolves prisma and
 * the current vendor so the app layer never touches `lib/db`. Constructed fresh per call, never
 * cached across requests.
 */
export function getMarketingConsentRepository() {
  const prisma = getPrisma();
  let profilePromise: ReturnType<typeof getCurrentVendorProfile> | undefined;
  const profile = () => (profilePromise ??= getCurrentVendorProfile());

  return {
    /** The current store's switch, its statement, and this user's newest choice there. */
    async forUser(userId: string): Promise<{
      enabled: boolean;
      statement: string | null;
      state: MarketingConsentState | null;
    }> {
      const vendor = await profile();
      if (!vendor) return { enabled: false, statement: null, state: null };
      const state = await getMarketingConsentState(prisma, vendor.id, userId);
      return {
        enabled: vendor.marketingConsentEnabled,
        statement: marketingConsentStatement(vendor.name),
        state,
      };
    },

    /**
     * Records an account-page choice. Opting in requires the switch to be on; withdrawing is
     * always allowed while the newest choice is a grant, even after the store switched the
     * feature off — withdrawal must never be harder than consent. Returns whether it wrote.
     */
    async recordAccountChoice(userId: string, granted: boolean): Promise<boolean> {
      const vendor = await profile();
      if (!vendor) return false;
      if (granted) {
        if (!vendor.marketingConsentEnabled) return false;
      } else {
        const current = await getMarketingConsentState(prisma, vendor.id, userId);
        if (current?.granted !== true) return false;
      }
      await recordMarketingConsent(prisma, vendor.id, userId, {
        granted,
        statement: marketingConsentStatement(vendor.name),
        source: "ACCOUNT",
      });
      return true;
    },

    /** `/staff/storefront`'s switch for the given vendor (the caller has already checked ADMIN). */
    async setEnabled(vendorId: string, enabled: boolean): Promise<number> {
      return setVendorMarketingConsentEnabled(prisma, vendorId, enabled);
    },
  };
}
