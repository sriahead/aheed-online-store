import { DEFAULT_PLATFORM_NAME, DEFAULT_PLATFORM_URL } from "@/lib/platform-defaults";
import { emailBrandFrom, type EmailBrand } from "./brand";

/**
 * #1564 — a neutral brand from the store name alone: no mark, neutral colours, no address. Used
 * when a caller has not loaded the store's branding (a unit test, or a branding read that failed),
 * so an email still renders properly instead of failing.
 */
export function fallbackBrand(storeName: string, siteUrl: string | null = null): EmailBrand {
  return emailBrandFrom({
    storeName,
    markStorageKey: null,
    primaryHex: null,
    backgroundHex: null,
    location: null,
    cdnBaseUrl: null,
    siteUrl,
    platformName: DEFAULT_PLATFORM_NAME,
    platformUrl: DEFAULT_PLATFORM_URL,
  });
}
