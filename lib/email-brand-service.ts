import { getEnv } from "@/lib/config";
import { getPrisma } from "@/lib/db";
import { emailBrandFrom, type EmailBrand } from "@/lib/email/layout/brand";
import { fallbackBrand } from "@/lib/email/layout/fallback";
import { DEFAULT_PLATFORM_NAME, DEFAULT_PLATFORM_URL } from "@/lib/platform-defaults";
import {
  fetchVendorProfile,
  getVendorLocation,
  type VendorProfile,
} from "@/lib/repositories/vendor";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";

/**
 * The brand from a profile and location already read. Never throws: config that cannot be read
 * (CDN base, platform name) degrades to the neutral brand rather than costing the email.
 */
export function buildEmailBrand(
  profile: Pick<VendorProfile, "senderName" | "markStorageKey" | "primitives"> & {
    platformBrandingTerminology?: string;
  },
  location: Parameters<typeof emailBrandFrom>[0]["location"],
  siteUrl: string | null,
): EmailBrand {
  try {
    return emailBrandFrom({
      storeName: profile.senderName,
      markStorageKey: profile.markStorageKey,
      primaryHex: profile.primitives["green-dark"],
      backgroundHex: profile.primitives.cream,
      location,
      cdnBaseUrl: getEnv().CDN_BASE_URL ?? null,
      siteUrl,
      // The operator's own attribution, never PLATFORM_NAME: a dedicated cell sets that to the
      // store's name (wrangler.toml), which would make the footer read "Powered by <store>".
      platformName: DEFAULT_PLATFORM_NAME,
      platformUrl: DEFAULT_PLATFORM_URL,
      platformBrandingTerminology: profile.platformBrandingTerminology,
    });
  } catch {
    return fallbackBrand(profile.senderName, siteUrl);
  }
}

/**
 * #1564 R2 — the request-scoped half of email branding: reads the store's profile (name, mark,
 * colours) and location, the CDN base and the platform's name and link, and builds an
 * `EmailBrand`. Never rejects: a failed read degrades to the neutral brand so the email still goes.
 */
export async function loadEmailBrand(
  vendorId: string,
  siteUrl: string | null,
  storeNameHint?: string,
): Promise<EmailBrand> {
  try {
    const prisma = getPrisma();
    const [profile, location] = await Promise.all([
      fetchVendorProfile(prisma, vendorId),
      getVendorLocation(prisma, vendorId).catch(() => null),
    ]);
    return buildEmailBrand(profile, location, siteUrl);
  } catch (error) {
    console.error(
      `email brand load failed vendorId=${vendorId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return fallbackBrand(storeNameHint ?? "", siteUrl);
  }
}

/** The brand of the store this request belongs to, or a neutral one on a platform host. */
export async function getCurrentEmailBrand(
  siteUrl: string | null,
  storeNameHint: string,
): Promise<EmailBrand> {
  const vendorId = await getCurrentVendorIdOrNull().catch(() => null);
  if (!vendorId) return fallbackBrand(storeNameHint, siteUrl);
  return loadEmailBrand(vendorId, siteUrl, storeNameHint);
}
