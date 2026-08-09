import { cache } from "react";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";

/**
 * Per-vendor branding/config/delivery read path (ADR-004 slice 4). The ONLY
 * DB-access path for vendor branding — layouts/components/pages call this, never
 * Prisma directly (slice-2 no-direct-Prisma guard). Prisma is constructed fresh
 * per call (Workers rule); the RSC-facing `getCurrentVendorProfile` is memoized
 * per request with React `cache()` so header + layout + page + metadata share a
 * single query, never cached across requests.
 */

/** The eight `--color-brand-*` primitives, keyed by the token suffix. */
export type BrandPrimitives = Record<
  "green-dark" | "green" | "orange" | "red" | "cream" | "green-tint" | "orange-tint" | "red-tint",
  string
>;

export interface VendorProfile {
  name: string;
  tagline: string | null;
  logoStorageKey: string | null;
  primitives: BrandPrimitives;
  localityName: string;
  senderName: string;
  senderEmail: string;
  searchPlaceholder: string;
  deliveryPrefixes: string[];
}

// Fallbacks = the Aheed defaults already in design-system/tokens/tokens.css, so a
// vendor resolved before its satellites are seeded renders today's theme rather
// than a broken/empty one (deploy-before-seed safety, mirroring slice 3b).
export const DEFAULT_BRAND_PRIMITIVES: BrandPrimitives = {
  "green-dark": "#1b5e20",
  green: "#4caf50",
  orange: "#f57c00",
  red: "#d32f2f",
  cream: "#f5f5f0",
  "green-tint": "#e8f5e9",
  "orange-tint": "#fff3e0",
  "red-tint": "#ffebee",
};
export const DEFAULT_SENDER_NAME = "Aheed Food Centre";
export const DEFAULT_SEARCH_PLACEHOLDER = "Search products…";

/** Core fetch (not memoized) — safe to call outside a React render, and unit-testable. */
export async function fetchVendorProfile(vendorId: string): Promise<VendorProfile> {
  const prisma = getPrisma();
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      name: true,
      branding: {
        select: {
          name: true,
          tagline: true,
          logoStorageKey: true,
          brandGreenDark: true,
          brandGreen: true,
          brandOrange: true,
          brandRed: true,
          brandCream: true,
          brandGreenTint: true,
          brandOrangeTint: true,
          brandRedTint: true,
        },
      },
      config: {
        select: {
          localityName: true,
          senderName: true,
          senderEmail: true,
          searchPlaceholder: true,
        },
      },
      deliveryAreas: { select: { prefix: true } },
    },
  });

  const b = vendor?.branding;
  return {
    name: b?.name ?? vendor?.name ?? DEFAULT_SENDER_NAME,
    tagline: b?.tagline ?? null,
    logoStorageKey: b?.logoStorageKey ?? null,
    primitives: b
      ? {
          "green-dark": b.brandGreenDark,
          green: b.brandGreen,
          orange: b.brandOrange,
          red: b.brandRed,
          cream: b.brandCream,
          "green-tint": b.brandGreenTint,
          "orange-tint": b.brandOrangeTint,
          "red-tint": b.brandRedTint,
        }
      : DEFAULT_BRAND_PRIMITIVES,
    localityName: vendor?.config?.localityName ?? "",
    senderName: vendor?.config?.senderName ?? DEFAULT_SENDER_NAME,
    senderEmail: vendor?.config?.senderEmail ?? "",
    searchPlaceholder: vendor?.config?.searchPlaceholder ?? DEFAULT_SEARCH_PLACEHOLDER,
    deliveryPrefixes: (vendor?.deliveryAreas ?? []).map((a) => a.prefix),
  };
}

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
