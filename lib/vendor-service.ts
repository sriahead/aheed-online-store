import { cache } from "react";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";
import {
  DEFAULT_SENDER_NAME,
  fetchVendorProfile,
  type VendorProfile,
} from "@/lib/repositories/vendor";

/**
 * Request-scoped vendor-profile accessors (#252) — the two functions that
 * resolve WHICH vendor the current request belongs to, split out of
 * `lib/repositories/vendor.ts` so every export there takes `vendorId`
 * explicitly and a plain `tsx` script can import that module in real Node.
 *
 * `fetchVendorProfile(vendorId)` stays in the repository and is what both of
 * these delegate to. `tests/repository-purity.test.ts` enforces the location.
 */

/**
 * The current request's vendor profile, or `null` when the host resolves to no
 * vendor (the storefront layout redirects those to /coming-soon). Memoized per
 * request — one query shared across layout/header/page/metadata.
 */
export const getCurrentVendorProfile = cache(async (): Promise<VendorProfile | null> => {
  const vendorId = await getCurrentVendorIdOrNull();
  return vendorId ? fetchVendorProfile(vendorId) : null;
});

/**
 * Vendor sender name for transactional email subjects (lib/auth.ts). Deliberately
 * NOT the `cache()`d accessor: it runs inside Better Auth's route-handler callback,
 * not a React render. Falls back to the platform default when unresolved.
 */
export async function getCurrentVendorSenderName(): Promise<string> {
  const vendorId = await getCurrentVendorIdOrNull();
  if (!vendorId) return DEFAULT_SENDER_NAME;
  return (await fetchVendorProfile(vendorId)).senderName;
}
