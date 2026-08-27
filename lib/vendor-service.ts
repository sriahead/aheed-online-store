import { cache } from "react";
import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";
import {
  DEFAULT_SENDER_NAME,
  fetchVendorProfile as fetchVendorProfileRepo,
  getVendorBranding as getVendorBrandingRepo,
  getVendorConfig as getVendorConfigRepo,
  updateVendorLogoKey as updateVendorLogoKeyRepo,
  updateVendorStorefrontConfig as updateVendorStorefrontConfigRepo,
  type VendorProfile,
  type VendorStorefrontConfigInput,
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
  return vendorId ? fetchVendorProfileRepo(getPrisma(), vendorId) : null;
});

/**
 * Vendor sender name for transactional email subjects (lib/auth.ts). Deliberately
 * NOT the `cache()`d accessor: it runs inside Better Auth's route-handler callback,
 * not a React render. Falls back to the platform default when unresolved.
 */
export async function getCurrentVendorSenderName(): Promise<string> {
  const vendorId = await getCurrentVendorIdOrNull();
  if (!vendorId) return DEFAULT_SENDER_NAME;
  return (await fetchVendorProfileRepo(getPrisma(), vendorId)).senderName;
}

/* ------------------------------------------------------------------------- *
 * Vendor entry points taking an explicit vendorId (#411)
 *
 * Distinct from the two accessors above, which resolve the vendor from the
 * request host because their callers genuinely do not know it. These four have
 * callers that do: `requireVendorRole` on the staff storefront page, and
 * `order.vendorId` on the two transactional-email paths.
 *
 * Repository names are kept so a call site moves by changing its import path
 * alone; the originals are aliased `…Repo` above.
 * ------------------------------------------------------------------------- */

/**
 * The vendor profile for a KNOWN vendor — used by the confirmation and
 * status-email paths, which hold `order.vendorId` and run outside a React
 * render, so neither the host lookup nor `cache()` applies.
 */
export async function fetchVendorProfile(vendorId: string): Promise<VendorProfile> {
  return fetchVendorProfileRepo(getPrisma(), vendorId);
}

export async function getVendorConfig(vendorId: string) {
  return getVendorConfigRepo(getPrisma(), vendorId);
}

export async function getVendorBranding(vendorId: string) {
  return getVendorBrandingRepo(getPrisma(), vendorId);
}

export async function updateVendorLogoKey(vendorId: string, logoStorageKey: string) {
  return updateVendorLogoKeyRepo(getPrisma(), vendorId, logoStorageKey);
}

/**
 * `getPrismaWs()`, not `getPrisma()`: this opens an interactive transaction so
 * the config and branding rows commit together, and the HTTP adapter cannot
 * execute one at all (#382).
 */
export async function updateVendorStorefrontConfig(
  vendorId: string,
  data: VendorStorefrontConfigInput,
) {
  return updateVendorStorefrontConfigRepo(getPrismaWs(), vendorId, data);
}
