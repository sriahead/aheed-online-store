import type { getPrisma, getPrismaWs } from "@/lib/db";

/**
 * Per-vendor branding/config/delivery read path (ADR-004 slice 4). The ONLY
 * DB-access path for vendor branding — layouts/components/pages reach it through
 * `lib/vendor-service.ts` (slice-2 no-direct-Prisma guard).
 *
 * Every export here takes its Prisma client AND `vendorId` explicitly and reads
 * no request context; the RSC-facing `getCurrentVendorProfile`, which resolves
 * the vendor from the request host and memoizes it per request with React
 * `cache()`, lives in `lib/vendor-service.ts` (#252). That service is also what
 * constructs the client, fresh per call (Workers rule).
 *
 * Two tests enforce the two halves: `tests/repository-purity.test.ts` for the
 * request-context split, `tests/repository-client-injection.test.ts` for the
 * client parameter. **Until #411 this file resolved its own client in all five
 * exports**, while the paragraph above already claimed the property — one of
 * several docstrings that asserted it without it being true or checked.
 */

/** The eight `--color-brand-*` primitives, keyed by the token suffix. */
export type BrandPrimitives = Record<
  "green-dark" | "green" | "orange" | "red" | "cream" | "green-tint" | "orange-tint" | "red-tint",
  string
>;

export interface VendorProfile {
  /** Vendor slug — used to derive the order-number prefix (P3b). */
  slug: string;
  name: string;
  tagline: string | null;
  logoStorageKey: string | null;
  primitives: BrandPrimitives;
  localityName: string;
  senderName: string;
  senderEmail: string;
  searchPlaceholder: string;
  /**
   * P7.5c+f (#239) — per-vendor storefront copy. `null` means HIDE the element,
   * not "fall back to something neutral": the strings these replaced were Aheed
   * marketing rendering on every vendor, and platform-written filler is still a
   * claim made on a vendor's behalf.
   */
  bannerNote: string | null;
  heroSubtitle: string | null;
  deliveryPrefixes: string[];
  // P3a — delivery rules as vendor data. P3a reads only the threshold (cart
  // banner); applying fee/minimum to a payable total is P3b.
  deliveryFeePence: number;
  freeDeliveryThresholdPence: number | null;
  minimumOrderPence: number;
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
export async function fetchVendorProfile(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<VendorProfile> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      slug: true,
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
          bannerNote: true,
          heroSubtitle: true,
          deliveryFeePence: true,
          freeDeliveryThresholdPence: true,
          minimumOrderPence: true,
        },
      },
      deliveryAreas: { select: { prefix: true } },
    },
  });

  const b = vendor?.branding;
  return {
    slug: vendor?.slug ?? "",
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
    // No platform default for either — an unseeded vendor renders neither
    // element rather than borrowing Aheed's voice.
    bannerNote: vendor?.config?.bannerNote ?? null,
    heroSubtitle: vendor?.config?.heroSubtitle ?? null,
    deliveryPrefixes: (vendor?.deliveryAreas ?? []).map((a) => a.prefix),
    // Fall back to the schema defaults when the config satellite is unseeded,
    // matching the deploy-before-seed safety the rest of this file uses.
    deliveryFeePence: vendor?.config?.deliveryFeePence ?? 349,
    freeDeliveryThresholdPence: vendor?.config?.freeDeliveryThresholdPence ?? null,
    minimumOrderPence: vendor?.config?.minimumOrderPence ?? 0,
  };
}

/* The two request-scoped accessors that used to sit here — `getCurrentVendorProfile`
 * and `getCurrentVendorSenderName` — now live in `lib/vendor-service.ts` (#252).
 * They resolved the vendor from the request host, which is the one thing this
 * module must not do if a plain `tsx` script is to be able to import it. */

export async function getVendorConfig(prisma: ReturnType<typeof getPrisma>, vendorId: string) {
  return prisma.vendorConfig.findUnique({ where: { vendorId } });
}

export async function getVendorBranding(prisma: ReturnType<typeof getPrisma>, vendorId: string) {
  return prisma.vendorBranding.findUnique({ where: { vendorId } });
}

export async function updateVendorLogoKey(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  logoStorageKey: string,
) {
  return prisma.vendorBranding.update({
    where: { vendorId },
    data: { logoStorageKey },
  });
}

/**
 * The staff storefront form's payload (#411).
 *
 * The two config fields are `string | null` because `null` is meaningful here —
 * it HIDES the element rather than falling back to filler (see `VendorProfile`
 * above). The eight brand primitives are optional because the form submits only
 * what changed; an absent key must leave the stored colour alone, which is why
 * the writes below test presence rather than spreading the object.
 *
 * Replaced a `data: any` (#411). That `any` meant the caller's shape and this
 * function's reads could drift apart with nothing to catch it — the eight
 * `brand*` names are matched by hand below and a typo would simply have stopped
 * writing that colour, silently.
 */
export interface VendorStorefrontConfigInput {
  bannerNote: string | null;
  heroSubtitle: string | null;
  brandGreenDark?: string;
  brandGreen?: string;
  brandOrange?: string;
  brandRed?: string;
  brandCream?: string;
  brandGreenTint?: string;
  brandOrangeTint?: string;
  brandRedTint?: string;
}

/** The eight optional brand primitives, in the order the form presents them. */
const BRAND_FIELDS = [
  "brandGreenDark",
  "brandGreen",
  "brandOrange",
  "brandRed",
  "brandCream",
  "brandGreenTint",
  "brandOrangeTint",
  "brandRedTint",
] as const satisfies readonly (keyof VendorStorefrontConfigInput)[];

export async function updateVendorStorefrontConfig(
  prismaWs: ReturnType<typeof getPrismaWs>,
  vendorId: string,
  data: VendorStorefrontConfigInput,
) {
  // A WebSocket client, not an HTTP one: $transaction throws unconditionally on
  // the HTTP-mode client — PrismaNeonHttp cannot execute interactive
  // transactions at all, regardless of what runs inside them (#382). The caller
  // in lib/vendor-service.ts is what passes getPrismaWs().
  return prismaWs.$transaction(async (tx) => {
    await tx.vendorConfig.update({
      where: { vendorId },
      data: {
        bannerNote: data.bannerNote,
        heroSubtitle: data.heroSubtitle,
      },
    });

    const brandingUpdates: Partial<Record<(typeof BRAND_FIELDS)[number], string>> = {};
    for (const field of BRAND_FIELDS) {
      const value = data[field];
      if (value) brandingUpdates[field] = value;
    }

    if (Object.keys(brandingUpdates).length > 0) {
      await tx.vendorBranding.update({
        where: { vendorId },
        data: brandingUpdates,
      });
    }
  });
}
