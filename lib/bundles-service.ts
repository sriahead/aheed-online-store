import { cache } from "react";
import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";
import {
  listActiveBundles,
  getBundleWithItems,
  listBundlesForAdmin,
  upsertBundle,
  setBundleItems,
  setBundleImage,
  deleteBundle,
  type BundleWithItems,
  type BundleAdminRow,
  type BundleWriteInput,
  type BundleWriteResult,
  type BundleItemWriteInput,
} from "@/lib/repositories/bundles";

/**
 * Request-scoped wrapper around `lib/repositories/bundles.ts`'s pure functions
 * (P8.5c, #347) — resolves a live Prisma client, and for the storefront read,
 * the current vendor too.
 *
 * Lives beside, not inside, `lib/repositories/` for the reason #252/P8.1b
 * settled and `tests/repository-purity.test.ts` now enforces with no allowlist:
 * the repository module's exports take `prisma`/`vendorId` explicitly and read
 * no request context, so a plain `tsx` script can drive them without a live
 * Workers request.
 *
 * This file also exists because `app/**`, `features/**` and `components/**` are
 * ESLint-forbidden from importing `@/lib/db` at all (`no-restricted-imports`,
 * ADR-004 slice 2) — so the thin `getPrisma()`-constructing wrap has to live
 * somewhere the app layer may import.
 *
 * Prisma is constructed fresh per call, never cached across requests.
 */

/** Storefront read for `/categories`. Memoised per request with React `cache()`. */
export const getBundlesForStorefront = cache(async (): Promise<BundleWithItems[]> => {
  const vendorId = await getCurrentVendorIdOrNull();
  // An unresolved host gets no bundles, same posture as the hero campaigns read
  // — the storefront layout redirects these to /coming-soon anyway.
  if (!vendorId) return [];
  return listActiveBundles(getPrisma(), vendorId);
});

/** The add-to-cart action's read. `vendorId` resolved here, bundle id stays untrusted. */
export async function getBundleForCurrentVendor(bundleId: string): Promise<BundleWithItems | null> {
  const vendorId = await getCurrentVendorIdOrNull();
  if (!vendorId) return null;
  return getBundleWithItems(getPrisma(), vendorId, bundleId);
}

/** `/staff/bundles`'s list — `vendorId` already in hand from `requireVendorRole`. */
export function listBundlesForVendor(vendorId: string): Promise<BundleAdminRow[]> {
  return listBundlesForAdmin(getPrisma(), vendorId);
}

/** `/staff/bundles/[bundleId]`'s edit page. */
export function getBundleForVendor(
  vendorId: string,
  bundleId: string,
): Promise<BundleWithItems | null> {
  return getBundleWithItems(getPrisma(), vendorId, bundleId);
}

/** `features/admin/bundles.ts`'s `saveBundle` action. */
export function saveBundleForVendor(
  vendorId: string,
  bundleId: string | null,
  input: BundleWriteInput,
): Promise<BundleWriteResult> {
  return upsertBundle(getPrisma(), vendorId, bundleId, input);
}

/** `features/admin/bundles.ts`'s `saveBundleItems` action. */
export function saveBundleItemsForVendor(
  vendorId: string,
  bundleId: string,
  items: readonly BundleItemWriteInput[],
): Promise<BundleWriteResult> {
  return setBundleItems(getPrisma(), getPrismaWs(), vendorId, bundleId, items);
}

/** `features/admin/bundles.ts`'s `removeBundle` action. */
export function deleteBundleForVendor(
  vendorId: string,
  bundleId: string,
): Promise<BundleWriteResult> {
  return deleteBundle(getPrisma(), vendorId, bundleId);
}

/** `features/admin/bundle-image.ts`'s `attachBundleImage` action. */
export function saveBundleImageForVendor(
  vendorId: string,
  bundleId: string,
  imageKey: string,
  altText: string,
): Promise<BundleWriteResult> {
  return setBundleImage(getPrisma(), vendorId, bundleId, imageKey, altText);
}
