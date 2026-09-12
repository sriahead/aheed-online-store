import type { getPrisma, getPrismaWs } from "@/lib/db";

/**
 * Re-exported so the app/UI/feature layers can type a prop against the real
 * Prisma row shape (#639, R19) without importing `@prisma/client` directly —
 * `eslint.config.mjs`'s `no-restricted-imports` blocks that import (type-only
 * included) outside `lib/repositories/*`, so this repository is the seam.
 */
export type { VendorConfig, VendorBranding, Theme } from "@prisma/client";

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
  /**
   * P9.2 (#407, #405) — social and contact identity, under the same rule as the two lines above.
   * `null` HIDES that link; there is no platform default, because a platform-written social link
   * is a claim made on a vendor's behalf. Both URLs are stored https-only
   * (`lib/social-contact-form.ts`); `whatsappNumber` is digits only, for `wa.me`.
   */
  facebookUrl: string | null;
  instagramUrl: string | null;
  whatsappNumber: string | null;
  deliveryPrefixes: string[];
  // P3a — delivery rules as vendor data. P3a reads only the threshold (cart
  // banner); applying fee/minimum to a payable total is P3b.
  deliveryFeePence: number;
  freeDeliveryThresholdPence: number | null;
  minimumOrderPence: number;
  offerCollection: boolean;
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
          facebookUrl: true,
          instagramUrl: true,
          whatsappNumber: true,
          deliveryFeePence: true,
          freeDeliveryThresholdPence: true,
          minimumOrderPence: true,
          offerCollection: true,
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
    // Same reasoning — an unseeded vendor shows no social links at all rather
    // than borrowing another vendor's accounts (#407, #405).
    facebookUrl: vendor?.config?.facebookUrl ?? null,
    instagramUrl: vendor?.config?.instagramUrl ?? null,
    whatsappNumber: vendor?.config?.whatsappNumber ?? null,
    deliveryPrefixes: (vendor?.deliveryAreas ?? []).map((a) => a.prefix),
    // Fall back to the schema defaults when the config satellite is unseeded,
    // matching the deploy-before-seed safety the rest of this file uses.
    deliveryFeePence: vendor?.config?.deliveryFeePence ?? 349,
    freeDeliveryThresholdPence: vendor?.config?.freeDeliveryThresholdPence ?? null,
    minimumOrderPence: vendor?.config?.minimumOrderPence ?? 0,
    offerCollection: vendor?.config?.offerCollection ?? false,
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

export async function getVendorLocation(prisma: ReturnType<typeof getPrisma>, vendorId: string) {
  return prisma.vendorLocation.findUnique({ where: { vendorId } });
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
  /**
   * `null` clears the line (which HIDES its element — see the model comment);
   * `undefined` leaves the stored value alone, which is what lets the
   * delivery-rules form (#634) save without touching copy it does not own.
   * Prisma reads `undefined` in an `update` as "no change", so this needs no
   * conditional spread.
   */
  bannerNote?: string | null;
  heroSubtitle?: string | null;
  /**
   * P9.2 (#407, #405) — same optionality rule as the copy fields above, and it matters for the
   * same reason: the branding form and the delivery-rules form both submit without these, and
   * omitting them must leave a vendor's social links alone rather than clearing them. `null` is
   * an explicit clear (which hides the link); `undefined` is "not this form's business".
   */
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  whatsappNumber?: string | null;
  /**
   * #634 — the three delivery rules. Optional as a group: the branding half of
   * this form submits without them, and omitting them must leave the stored
   * values alone rather than reset them to a default.
   */
  deliveryFeePence?: number;
  freeDeliveryThresholdPence?: number | null;
  minimumOrderPence?: number;
  offerCollection?: boolean;
  location?: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    postcode: string;
  } | null;
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
        // Direct assignment, like the two above and unlike the delivery numbers below: Prisma
        // reads `undefined` in an `update` as "no change", which is exactly the semantics these
        // need, so no conditional spread is required to keep absent distinct from cleared.
        facebookUrl: data.facebookUrl,
        instagramUrl: data.instagramUrl,
        whatsappNumber: data.whatsappNumber,
        // #634 — written only when supplied. `freeDeliveryThresholdPence` is
        // explicitly nullable, so `undefined` (absent) and `null` (free
        // delivery never offered) must stay distinguishable here; spreading a
        // conditional object is what keeps Prisma from seeing a key at all.
        ...(data.deliveryFeePence !== undefined ? { deliveryFeePence: data.deliveryFeePence } : {}),
        ...(data.freeDeliveryThresholdPence !== undefined
          ? { freeDeliveryThresholdPence: data.freeDeliveryThresholdPence }
          : {}),
        ...(data.minimumOrderPence !== undefined
          ? { minimumOrderPence: data.minimumOrderPence }
          : {}),
        ...(data.offerCollection !== undefined ? { offerCollection: data.offerCollection } : {}),
      },
    });

    if (data.offerCollection && data.location !== undefined) {
      if (data.location) {
        await tx.vendorLocation.upsert({
          where: { vendorId },
          create: {
            vendorId,
            ...data.location,
          },
          update: data.location,
        });
      } else {
        // Technically this shouldn't happen based on parseDeliveryRules, but if it does,
        // we could delete the location if they uncheck the box. However, retaining the
        // snapshot is better. Let's just leave it alone if they uncheck it.
      }
    }

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

/**
 * The seeded theme catalogue (#75), listed by name for the `/staff/storefront` picker.
 * `Theme` is a platform-level model with no `vendorId` (see the schema doc comment), so
 * this takes no vendor parameter — it is not a tenant-scoped read.
 */
export async function listThemes(prisma: ReturnType<typeof getPrisma>) {
  return prisma.theme.findMany({ orderBy: { name: "asc" } });
}

export async function listVendorThemes(prisma: ReturnType<typeof getPrisma>, vendorId: string) {
  return prisma.vendorTheme.findMany({
    where: { vendorId },
    orderBy: { name: "asc" },
  });
}

export async function saveVendorTheme(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  name: string,
  primitives: BrandPrimitives,
) {
  return prisma.vendorTheme.create({
    data: {
      vendorId,
      name,
      brandGreenDark: primitives["green-dark"],
      brandGreen: primitives.green,
      brandOrange: primitives.orange,
      brandRed: primitives.red,
      brandCream: primitives.cream,
      brandGreenTint: primitives["green-tint"],
      brandOrangeTint: primitives["orange-tint"],
      brandRedTint: primitives["red-tint"],
    },
  });
}

/**
 * Apply a theme to a vendor's branding (#75, #714) — COPIES the theme's eight brand
 * primitives onto `VendorBranding`. Resolves `themeRef` explicitly:
 * - `global:<id>` → queries the global `Theme` table
 * - `vendor:<id>` → queries `VendorTheme` strictly scoped to this `vendorId`
 */
export async function applyThemeToVendor(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  themeRef: string,
): Promise<{ ok: true } | { ok: false }> {
  let theme: null | {
    id: string;
    brandGreenDark: string;
    brandGreen: string;
    brandOrange: string;
    brandRed: string;
    brandCream: string;
    brandGreenTint: string;
    brandOrangeTint: string;
    brandRedTint: string;
  } = null;
  let themeIdToSave: string | null = null;

  if (themeRef.startsWith("global:")) {
    const id = themeRef.substring(7);
    theme = await prisma.theme.findUnique({ where: { id } });
    if (theme) themeIdToSave = theme.id;
  } else if (themeRef.startsWith("vendor:")) {
    const id = themeRef.substring(7);
    const vendorThemes = await prisma.vendorTheme.findMany({
      where: { id, vendorId },
      take: 1,
    });
    if (vendorThemes.length > 0) {
      theme = vendorThemes[0];
    }
  }

  if (!theme) return { ok: false };

  await prisma.vendorBranding.update({
    where: { vendorId },
    data: {
      themeId: themeIdToSave,
      brandGreenDark: theme.brandGreenDark,
      brandGreen: theme.brandGreen,
      brandOrange: theme.brandOrange,
      brandRed: theme.brandRed,
      brandCream: theme.brandCream,
      brandGreenTint: theme.brandGreenTint,
      brandOrangeTint: theme.brandOrangeTint,
      brandRedTint: theme.brandRedTint,
    },
  });
  return { ok: true };
}

/**
 * Every ACTIVE vendor's id (P9.2, #618).
 *
 * The scheduled payment sweep has no request host and therefore no current
 * vendor, but its candidate query is vendor-scoped by design, so it needs the
 * set to iterate. `Vendor` carries no `vendorId` column of its own, so this is
 * not a tenant-scoped read and needs no vendor parameter — it enumerates the
 * tenants rather than reading inside one.
 *
 * SUSPENDED vendors are deliberately excluded. A suspended store is one whose
 * disposition nobody has decided yet, and quietly cancelling its customers'
 * orders — or confirming them and sending confirmation emails on its behalf —
 * is a worse default than leaving them for whoever resolves the suspension.
 */
export async function listActiveVendorIds(prisma: ReturnType<typeof getPrisma>): Promise<string[]> {
  const rows = await prisma.vendor.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
