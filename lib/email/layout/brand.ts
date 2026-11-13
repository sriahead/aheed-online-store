import { composePublicUrl } from "@/lib/storage";

/**
 * #1564 R2/R3 — everything the email layout needs to look like the store, from the store's own data
 * (ADR-004). Nothing here names a vendor: a store without a mark gets its name as a wordmark, and a
 * brand colour that white text cannot sit on falls back to a neutral dark.
 */
export interface EmailBrand {
  storeName: string;
  /** Absolute URL of the square mark (PNG), or null for a text-only header. */
  markUrl: string | null;
  /** Button and accent colour, always readable under white text. */
  primary: string;
  /** Page background behind the card. */
  background: string;
  /** One line, e.g. "Unit 22, 13 North Tenth Street, Milton Keynes, MK9 3EL", or null. */
  address: string | null;
  /** `https://<store host>`, or null when the store has no known host. */
  siteUrl: string | null;
  platformName: string;
  platformUrl: string;
}

export const FALLBACK_PRIMARY = "#111827";
export const FALLBACK_BACKGROUND = "#f3f4f6";
const HEX = /^#[0-9a-f]{6}$/i;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** Contrast ratio of white text on `hex`. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** R2 — the brand colour when it is a valid hex white text can sit on (4.5:1), else neutral. */
export function safePrimary(hex: string | null | undefined): string {
  if (!hex || !HEX.test(hex.trim())) return FALLBACK_PRIMARY;
  const value = hex.trim().toLowerCase();
  return contrastWithWhite(value) >= 4.5 ? value : FALLBACK_PRIMARY;
}

/** A light background only: a dark or malformed one would sink the card. */
export function safeBackground(hex: string | null | undefined): string {
  if (!hex || !HEX.test(hex.trim())) return FALLBACK_BACKGROUND;
  const value = hex.trim().toLowerCase();
  return luminance(value) >= 0.75 ? value : FALLBACK_BACKGROUND;
}

export function emailBrandFrom(input: {
  storeName: string;
  markStorageKey: string | null;
  primaryHex: string | null;
  backgroundHex: string | null;
  location: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    postcode: string;
  } | null;
  cdnBaseUrl: string | null;
  siteUrl: string | null;
  platformName: string;
  platformUrl: string;
}): EmailBrand {
  const loc = input.location;
  const address = loc
    ? [loc.addressLine1, loc.addressLine2, loc.city, loc.postcode]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(", ")
    : null;
  return {
    storeName: input.storeName,
    markUrl:
      input.markStorageKey && input.cdnBaseUrl
        ? composePublicUrl(input.cdnBaseUrl, input.markStorageKey)
        : null,
    primary: safePrimary(input.primaryHex),
    background: safeBackground(input.backgroundHex),
    address: address || null,
    siteUrl: input.siteUrl ? input.siteUrl.replace(/\/+$/, "") : null,
    platformName: input.platformName,
    platformUrl: input.platformUrl,
  };
}
