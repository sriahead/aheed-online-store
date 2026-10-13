import type { Metadata, MetadataRoute } from "next";
import { composePublicUrl } from "@/lib/storage";
import { markFileKeys, type MarkFileKeys } from "@/lib/vendor-mark";

/**
 * The head icons, Open Graph image, manifest icons and `/favicon.ico` target for a vendor's
 * square mark (#1069). Pure: every input is a parameter, so `app/layout.tsx`, `app/manifest.ts`,
 * `app/favicon.ico/route.ts` and the header all agree, and each case is unit-testable without a
 * request.
 *
 * A vendor "has a mark" only when its key is well-formed AND `CDN_BASE_URL` is set — the same
 * condition `Header.tsx` already applies to the logo. In every other case each builder returns
 * nothing, so a vendor with no mark renders exactly as it did before this slice.
 */

/** Absolute CDN URLs for the five mark files, or `null` when the vendor has no usable mark. */
export function markUrls(
  markStorageKey: string | null | undefined,
  cdnBaseUrl: string | null | undefined,
): MarkFileKeys | null {
  if (!markStorageKey || !cdnBaseUrl) return null;
  const keys = markFileKeys(markStorageKey);
  if (!keys) return null;
  return {
    icon32: composePublicUrl(cdnBaseUrl, keys.icon32),
    apple180: composePublicUrl(cdnBaseUrl, keys.apple180),
    icon192: composePublicUrl(cdnBaseUrl, keys.icon192),
    icon512: composePublicUrl(cdnBaseUrl, keys.icon512),
    og: composePublicUrl(cdnBaseUrl, keys.og),
  };
}

/**
 * The `icons` and `openGraph` metadata to merge into the root layout's result. Returns `{}` —
 * no keys at all — without a mark, so the merged object is identical to the pre-#1069 one.
 */
export function buildVendorIconMetadata(
  vendorName: string,
  markStorageKey: string | null | undefined,
  cdnBaseUrl: string | null | undefined,
): Pick<Metadata, "icons" | "openGraph"> {
  const urls = markUrls(markStorageKey, cdnBaseUrl);
  if (!urls) return {};
  return {
    icons: {
      icon: [
        { url: urls.icon32, sizes: "32x32", type: "image/png" },
        { url: urls.icon192, sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: urls.apple180, sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      siteName: vendorName,
      type: "website",
      images: [{ url: urls.og, width: 1200, height: 630, alt: vendorName }],
    },
  };
}

/** The manifest's `icons`: the 192 and 512 PNGs, or `[]` without a mark. */
export function buildManifestIcons(
  markStorageKey: string | null | undefined,
  cdnBaseUrl: string | null | undefined,
): NonNullable<MetadataRoute.Manifest["icons"]> {
  const urls = markUrls(markStorageKey, cdnBaseUrl);
  if (!urls) return [];
  return [
    { src: urls.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: urls.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
  ];
}

/** `/favicon.ico`'s redirect target (the 32px PNG), or `null` → 404. */
export function faviconRedirectUrl(
  markStorageKey: string | null | undefined,
  cdnBaseUrl: string | null | undefined,
): string | null {
  return markUrls(markStorageKey, cdnBaseUrl)?.icon32 ?? null;
}
