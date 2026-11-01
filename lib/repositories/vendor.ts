import type { getPrisma, getPrismaWs } from "@/lib/db";
import { STORE_TIMEZONE } from "@/lib/local-datetime";
import { DEFAULT_PRODUCT_GRID_DENSITY, type ProductGridDensity } from "@/lib/product-grid-density";
import { orderPaymentBadges, type PaymentBadgeMethodName } from "@/lib/payment-badges";
import type { HoursOverrideRow, WeeklyHoursRow } from "@/lib/footer-hours";
import { calendarDayToUtcMidnight } from "@/lib/local-datetime";

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
  /** #1069 — the square mark's `512.png` key; see `lib/vendor-mark.ts`. */
  markStorageKey: string | null;
  primitives: BrandPrimitives;
  localityName: string;
  /**
   * #363 — the vendor's IANA timezone. Every `datetime-local` conversion and the checkout slot
   * picker's notion of "today" resolve through here; `lib/local-datetime.ts` is told the zone and
   * never looks one up.
   */
  timezone: string;
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
  /**
   * #1078 — the header banner's first line, as the vendor wrote it. `null` does NOT hide the line
   * (unlike `bannerNote`): the header falls back to a line derived from the vendor's own name and
   * locality, which is vendor data rather than a claim written on its behalf.
   */
  bannerHeadline: string | null;
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
  /**
   * #1233 — per-vendor WhatsApp community group invite link and QR code object key for
   * `/whatsapp-offers`. `null` hides the WhatsApp banner and bottom CTA (#239).
   */
  whatsappCommunityUrl: string | null;
  whatsappCommunityQrKey: string | null;
  /**
   * #905 — which label controls the staff product form offers (`lib/product-label-settings.ts`
   * turns these into `ProductLabelSettings`). They never gate the storefront. `false` for a vendor
   * with no config row, so an unseeded vendor is offered none rather than another vendor's set.
   */
  showHalalLabel: boolean;
  showFreshLabel: boolean;
  showOrganicLabel: boolean;
  showVegetarianLabel: boolean;
  showGlutenFreeLabel: boolean;
  showHmcCertification: boolean;
  /** #905 — what the store sells, in its own words; the AI prompts' context. `null` = neutral. */
  storeDescription: string | null;
  /**
   * #962 — the product listing density preset, rendered by `components/product/ProductGrid.tsx`.
   * `STANDARD` for a vendor with no config row, which is also the column default.
   */
  productGridDensity: ProductGridDensity;
  /** Always `deliveryAreas.map(a => a.prefix)` — kept for the eligibility check's callers. */
  deliveryPrefixes: string[];
  /**
   * #890 — every delivery area/district with its per-area money overrides (`null` = the vendor
   * default below). Resolve a shopper's actual charges with `lib/delivery-pricing.ts`'s
   * `resolveDeliveryRules`, never by reading the three vendor-wide fields directly.
   */
  deliveryAreas: {
    prefix: string;
    deliveryFeePence: number | null;
    minimumOrderPence: number | null;
    freeDeliveryThresholdPence: number | null;
  }[];
  // P3a — delivery rules as vendor data (the DEFAULTS since #890). P3a reads only the threshold (cart
  // banner); applying fee/minimum to a payable total is P3b.
  deliveryFeePence: number;
  freeDeliveryThresholdPence: number | null;
  minimumOrderPence: number;
  /** #1083 — Click & Collect's own minimum; `0` = none. Not per-area: collection has no area. */
  collectionMinimumOrderPence: number;
  offerCollection: boolean;
  /**
   * #1015 — the guided help assistant's switch, read in this same query so the storefront render
   * gains no database read for it. It renders only when `whatsappNumber` is also set.
   */
  assistantEnabled: boolean;
  /**
   * #1134 — whether this store asks shoppers for marketing consent, read in this same query.
   * `false` for a vendor with no config row, which is also the column default.
   */
  marketingConsentEnabled: boolean;
  id: string;
  bookingWindowDays: number;
  slotHoldDurationMinutes: number;
  offerDeliverySlots: boolean;
  /** P402 (#402) — Express Collection (ASAP pickup), gated on a schedule window. */
  expressCollectionEnabled: boolean;
  expressSchedules: { dayOfWeek: number; openTime: string; closeTime: string }[];
  /**
   * #1055 — the storefront footer, read in this same query so the page render gains no database
   * call. Every string is `null` when unset, and a `null` HIDES its footer element — no platform
   * fallback (#239). Bracketed placeholders ("[YOUR EMAIL]") are real values that render as text.
   */
  contactPhone: string | null;
  contactEmail: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  registeredOffice: string | null;
  openingHoursNote: string | null;
  showSecureCheckoutNote: boolean;
  /** The store's own address (the collection address), or `null` when none is recorded. */
  location: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    postcode: string;
  } | null;
  /** #1060 — the weekly schedule, one row per configured weekday (any order; the view sorts). */
  weeklyHours: WeeklyHoursRow[];
  /**
   * #1060 — every stored override, `date` as the `YYYY-MM-DD` calendar day. Bounded by the save
   * path (past rows pruned, at most 50 upcoming), so reading them all costs no extra query.
   */
  hoursOverrides: (HoursOverrideRow & { id: string })[];
  /** In display order (`lib/payment-badges.ts`), not row order. */
  paymentBadges: PaymentBadgeMethodName[];
  /** #1023's gate, reused by the footer's Rewards link. */
  loyaltyEnabled: boolean;
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
/**
 * #363 — the zone a vendor with no `VendorConfig` row resolves to. Deliberately the same value as
 * `STORE_TIMEZONE` rather than a second literal: that constant is the platform default, and this
 * is the profile layer's name for it.
 */
export const DEFAULT_TIMEZONE = STORE_TIMEZONE;
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
          markStorageKey: true,
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
          timezone: true,
          senderName: true,
          senderEmail: true,
          searchPlaceholder: true,
          bannerNote: true,
          bannerHeadline: true,
          heroSubtitle: true,
          facebookUrl: true,
          instagramUrl: true,
          whatsappNumber: true,
          whatsappCommunityUrl: true,
          whatsappCommunityQrKey: true,
          showHalalLabel: true,
          showFreshLabel: true,
          showOrganicLabel: true,
          showVegetarianLabel: true,
          showGlutenFreeLabel: true,
          showHmcCertification: true,
          storeDescription: true,
          productGridDensity: true,
          deliveryFeePence: true,
          freeDeliveryThresholdPence: true,
          minimumOrderPence: true,
          collectionMinimumOrderPence: true,
          offerCollection: true,
          assistantEnabled: true,
          marketingConsentEnabled: true,
          bookingWindowDays: true,
          slotHoldDurationMinutes: true,
          offerDeliverySlots: true,
          expressCollectionEnabled: true,
          loyaltyEnabled: true,
          contactPhone: true,
          contactEmail: true,
          companyNumber: true,
          vatNumber: true,
          registeredOffice: true,
          openingHoursNote: true,
          showSecureCheckoutNote: true,
        },
      },
      location: {
        select: { addressLine1: true, addressLine2: true, city: true, postcode: true },
      },
      weeklyHours: {
        select: { dayOfWeek: true, openTime: true, closeTime: true, closed: true },
      },
      hoursOverrides: {
        select: {
          id: true,
          date: true,
          label: true,
          openTime: true,
          closeTime: true,
          closed: true,
        },
        orderBy: { date: "asc" },
      },
      paymentBadges: { select: { method: true } },
      deliveryAreas: {
        select: {
          prefix: true,
          deliveryFeePence: true,
          minimumOrderPence: true,
          freeDeliveryThresholdPence: true,
        },
      },
      vendorExpressSchedules: {
        select: { dayOfWeek: true, openTime: true, closeTime: true },
      },
    },
  });

  const b = vendor?.branding;
  return {
    slug: vendor?.slug ?? "",
    name: b?.name ?? vendor?.name ?? DEFAULT_SENDER_NAME,
    tagline: b?.tagline ?? null,
    logoStorageKey: b?.logoStorageKey ?? null,
    markStorageKey: b?.markStorageKey ?? null,
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
    // Unlike localityName, this one HAS a platform default: a vendor with no config row must still
    // convert dates somehow, and doing it in the platform's own zone is the behaviour every row in
    // the system had before #363. An empty string here would silently make Intl throw.
    timezone: vendor?.config?.timezone ?? DEFAULT_TIMEZONE,
    senderName: vendor?.config?.senderName ?? DEFAULT_SENDER_NAME,
    senderEmail: vendor?.config?.senderEmail ?? "",
    searchPlaceholder: vendor?.config?.searchPlaceholder ?? DEFAULT_SEARCH_PLACEHOLDER,
    // No platform default for either — an unseeded vendor renders neither
    // element rather than borrowing Aheed's voice.
    bannerNote: vendor?.config?.bannerNote ?? null,
    bannerHeadline: vendor?.config?.bannerHeadline ?? null,
    heroSubtitle: vendor?.config?.heroSubtitle ?? null,
    // Same reasoning — an unseeded vendor shows no social links at all rather
    // than borrowing another vendor's accounts (#407, #405).
    facebookUrl: vendor?.config?.facebookUrl ?? null,
    instagramUrl: vendor?.config?.instagramUrl ?? null,
    whatsappNumber: vendor?.config?.whatsappNumber ?? null,
    whatsappCommunityUrl: vendor?.config?.whatsappCommunityUrl ?? null,
    whatsappCommunityQrKey: vendor?.config?.whatsappCommunityQrKey ?? null,
    showHalalLabel: vendor?.config?.showHalalLabel ?? false,
    showFreshLabel: vendor?.config?.showFreshLabel ?? false,
    showOrganicLabel: vendor?.config?.showOrganicLabel ?? false,
    showVegetarianLabel: vendor?.config?.showVegetarianLabel ?? false,
    showGlutenFreeLabel: vendor?.config?.showGlutenFreeLabel ?? false,
    showHmcCertification: vendor?.config?.showHmcCertification ?? false,
    storeDescription: vendor?.config?.storeDescription ?? null,
    productGridDensity: vendor?.config?.productGridDensity ?? DEFAULT_PRODUCT_GRID_DENSITY,
    deliveryPrefixes: (vendor?.deliveryAreas ?? []).map((a) => a.prefix),
    deliveryAreas: vendor?.deliveryAreas ?? [],
    // Fall back to the schema defaults when the config satellite is unseeded,
    // matching the deploy-before-seed safety the rest of this file uses.
    deliveryFeePence: vendor?.config?.deliveryFeePence ?? 349,
    freeDeliveryThresholdPence: vendor?.config?.freeDeliveryThresholdPence ?? null,
    minimumOrderPence: vendor?.config?.minimumOrderPence ?? 0,
    collectionMinimumOrderPence: vendor?.config?.collectionMinimumOrderPence ?? 0,
    offerCollection: vendor?.config?.offerCollection ?? false,
    assistantEnabled: vendor?.config?.assistantEnabled ?? false,
    marketingConsentEnabled: vendor?.config?.marketingConsentEnabled ?? false,
    id: vendorId,
    bookingWindowDays: vendor?.config?.bookingWindowDays ?? 14,
    slotHoldDurationMinutes: vendor?.config?.slotHoldDurationMinutes ?? 15,
    offerDeliverySlots: vendor?.config?.offerDeliverySlots ?? false,
    expressCollectionEnabled: vendor?.config?.expressCollectionEnabled ?? false,
    expressSchedules: vendor?.vendorExpressSchedules ?? [],
    // #1055 — no platform default for any of these: an unseeded vendor's footer hides them.
    contactPhone: vendor?.config?.contactPhone ?? null,
    contactEmail: vendor?.config?.contactEmail ?? null,
    companyNumber: vendor?.config?.companyNumber ?? null,
    vatNumber: vendor?.config?.vatNumber ?? null,
    registeredOffice: vendor?.config?.registeredOffice ?? null,
    openingHoursNote: vendor?.config?.openingHoursNote ?? null,
    showSecureCheckoutNote: vendor?.config?.showSecureCheckoutNote ?? false,
    location: vendor?.location ?? null,
    weeklyHours: vendor?.weeklyHours ?? [],
    // `@db.Date` reads back as UTC midnight of the stored calendar day.
    hoursOverrides: (vendor?.hoursOverrides ?? []).map((o) => ({
      ...o,
      date: o.date.toISOString().slice(0, 10),
    })),
    paymentBadges: orderPaymentBadges((vendor?.paymentBadges ?? []).map((b) => b.method)),
    loyaltyEnabled: vendor?.config?.loyaltyEnabled ?? false,
  };
}

/* The two request-scoped accessors that used to sit here — `getCurrentVendorProfile`
 * and `getCurrentVendorSenderName` — now live in `lib/vendor-service.ts` (#252).
 * They resolved the vendor from the request host, which is the one thing this
 * module must not do if a plain `tsx` script is to be able to import it. */

export async function getVendorConfig(prisma: ReturnType<typeof getPrisma>, vendorId: string) {
  return prisma.vendorConfig.findUnique({ where: { vendorId } });
}

/**
 * #1015 — the help assistant's switch, owned by `/staff/assistant` alone. A singular, childless
 * `update` keyed on the vendor's own config row, so it runs over `getPrisma()` with no transaction
 * and can only ever touch this vendor. Returns the number of rows changed (0 for an unseeded
 * vendor with no config row).
 */
export async function setVendorAssistantEnabled(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  enabled: boolean,
): Promise<number> {
  const existing = await prisma.vendorConfig.findUnique({
    where: { vendorId },
    select: { id: true },
  });
  if (!existing) return 0;
  await prisma.vendorConfig.update({ where: { vendorId }, data: { assistantEnabled: enabled } });
  return 1;
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
 * #1069 — attach a vendor's square mark. A singular `update` with no nested writes, so it runs over
 * the HTTP client (CLAUDE.md Database rules). The caller has already verified all five files.
 */
export async function updateVendorMarkKey(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  markStorageKey: string,
) {
  return prisma.vendorBranding.update({
    where: { vendorId },
    data: { markStorageKey },
  });
}

/**
 * #1233 — attach or clear a vendor's WhatsApp community group QR code object key on `VendorConfig`.
 * A singular `update` with no nested writes, so it runs over the HTTP client (`getPrisma()`).
 */
export async function updateVendorWhatsappQrKey(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  whatsappCommunityQrKey: string | null,
) {
  return prisma.vendorConfig.update({
    where: { vendorId },
    data: { whatsappCommunityQrKey },
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
  /** #1078 — same direct-assignment rule as `bannerNote`: `null` clears, `undefined` leaves alone. */
  bannerHeadline?: string | null;
  heroSubtitle?: string | null;
  /**
   * #729 — header search-box hint, edited on the branding form. Same optionality rule: `null`
   * clears it (the profile then falls back to `DEFAULT_SEARCH_PLACEHOLDER`), `undefined` leaves it
   * alone, so the delivery-rules and social-links forms never touch it.
   */
  searchPlaceholder?: string | null;
  /**
   * P9.2 (#407, #405) — same optionality rule as the copy fields above, and it matters for the
   * same reason: the branding form and the delivery-rules form both submit without these, and
   * omitting them must leave a vendor's social links alone rather than clearing them. `null` is
   * an explicit clear (which hides the link); `undefined` is "not this form's business".
   */
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  whatsappNumber?: string | null;
  whatsappCommunityUrl?: string | null;
  /**
   * #905 — the six product-label settings and the store description, owned by the
   * catalogue-settings form alone. Same optionality rule: every other form omits them, so saving
   * branding, delivery or social links never touches them. `storeDescription: null` clears it.
   */
  showHalalLabel?: boolean;
  showFreshLabel?: boolean;
  showOrganicLabel?: boolean;
  showVegetarianLabel?: boolean;
  showGlutenFreeLabel?: boolean;
  showHmcCertification?: boolean;
  storeDescription?: string | null;
  /**
   * #962 — owned by the product-grid form alone. Same optionality rule: every other form omits it,
   * so saving any of them leaves the vendor's chosen density alone.
   */
  productGridDensity?: ProductGridDensity;
  /**
   * #1055 — the footer contact & legal fields, owned by that form alone. Same optionality rule:
   * every other form omits them, so saving any of them leaves the footer alone. `null` clears
   * (and therefore hides) the element.
   */
  contactPhone?: string | null;
  contactEmail?: string | null;
  companyNumber?: string | null;
  vatNumber?: string | null;
  registeredOffice?: string | null;
  openingHoursNote?: string | null;
  showSecureCheckoutNote?: boolean;
  /**
   * #634 — the three delivery rules. Optional as a group: the branding half of
   * this form submits without them, and omitting them must leave the stored
   * values alone rather than reset them to a default.
   */
  deliveryFeePence?: number;
  freeDeliveryThresholdPence?: number | null;
  minimumOrderPence?: number;
  /**
   * #1083 — sent only while the delivery-rules form shows the collection block. `undefined` (the
   * box unticked, so the field was never rendered) leaves the stored value alone.
   */
  collectionMinimumOrderPence?: number;
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
        bannerHeadline: data.bannerHeadline,
        heroSubtitle: data.heroSubtitle,
        searchPlaceholder: data.searchPlaceholder,
        // Direct assignment, like the two above and unlike the delivery numbers below: Prisma
        // reads `undefined` in an `update` as "no change", which is exactly the semantics these
        // need, so no conditional spread is required to keep absent distinct from cleared.
        facebookUrl: data.facebookUrl,
        instagramUrl: data.instagramUrl,
        whatsappNumber: data.whatsappNumber,
        whatsappCommunityUrl: data.whatsappCommunityUrl,
        // #905 — same direct assignment: only the catalogue-settings form supplies these.
        showHalalLabel: data.showHalalLabel,
        showFreshLabel: data.showFreshLabel,
        showOrganicLabel: data.showOrganicLabel,
        showVegetarianLabel: data.showVegetarianLabel,
        showGlutenFreeLabel: data.showGlutenFreeLabel,
        showHmcCertification: data.showHmcCertification,
        storeDescription: data.storeDescription,
        // #962 — same direct assignment: only the product-grid form supplies it.
        productGridDensity: data.productGridDensity,
        // #1055 — same direct assignment: only the footer contact form supplies these.
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        companyNumber: data.companyNumber,
        vatNumber: data.vatNumber,
        registeredOffice: data.registeredOffice,
        openingHoursNote: data.openingHoursNote,
        showSecureCheckoutNote: data.showSecureCheckoutNote,
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
        ...(data.collectionMinimumOrderPence !== undefined
          ? { collectionMinimumOrderPence: data.collectionMinimumOrderPence }
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

/** #1060 — what the footer hours form writes: the complete replacement set for both tables. */
export interface VendorFooterHoursInput {
  weeklyHours: WeeklyHoursRow[];
  paymentBadges: PaymentBadgeMethodName[];
}

/**
 * #1055/#1060 — replace this vendor's weekly-hours rows and payment-badge rows as one unit.
 *
 * A WebSocket client and an interactive transaction: the delete and the re-insert must commit
 * together (a failure between them would empty the footer), and `createMany` crashes
 * unconditionally over the HTTP adapter even on zero rows (#382, CLAUDE.md). Both tables are
 * scoped by `vendorId` in every statement, so this can only ever touch the caller's vendor.
 */
export async function replaceVendorFooterHours(
  prismaWs: ReturnType<typeof getPrismaWs>,
  vendorId: string,
  data: VendorFooterHoursInput,
) {
  return prismaWs.$transaction(async (tx) => {
    await tx.vendorWeeklyHours.deleteMany({ where: { vendorId } });
    if (data.weeklyHours.length > 0) {
      await tx.vendorWeeklyHours.createMany({
        data: data.weeklyHours.map((row) => ({ vendorId, ...row })),
      });
    }
    await tx.vendorPaymentBadge.deleteMany({ where: { vendorId } });
    if (data.paymentBadges.length > 0) {
      await tx.vendorPaymentBadge.createMany({
        data: data.paymentBadges.map((method) => ({ vendorId, method })),
      });
    }
  });
}

/** #1060 — the most upcoming overrides (today onwards) one vendor may hold. */
export const MAX_UPCOMING_HOURS_OVERRIDES = 50;

/**
 * #1060 — save one dated override, replacing any existing one for that date (`upsert` on
 * `vendorId_date`: one override per day is the edit path).
 *
 * Also prunes this vendor's overrides dated before `today`, which keeps the table — and the
 * footer's read of every override — bounded. A NEW date is refused once the vendor already holds
 * `MAX_UPCOMING_HOURS_OVERRIDES` from today on; replacing an existing date always works.
 *
 * The HTTP client is enough: `deleteMany`, `count`, `findUnique` and `upsert` open no
 * interactive transaction (CLAUDE.md). `today` and `row.date` are `YYYY-MM-DD` calendar days.
 */
export async function saveVendorHoursOverride(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  today: string,
  row: HoursOverrideRow,
): Promise<{ ok: true } | { ok: false; reason: "limit" }> {
  const todayDate = calendarDayToUtcMidnight(today);
  const date = calendarDayToUtcMidnight(row.date);
  if (!todayDate || !date) throw new Error("saveVendorHoursOverride: not a calendar day");

  await prisma.vendorHoursOverride.deleteMany({ where: { vendorId, date: { lt: todayDate } } });

  const existing = await prisma.vendorHoursOverride.findUnique({
    where: { vendorId_date: { vendorId, date } },
    select: { id: true },
  });
  if (!existing) {
    const upcoming = await prisma.vendorHoursOverride.count({ where: { vendorId } });
    if (upcoming >= MAX_UPCOMING_HOURS_OVERRIDES) return { ok: false, reason: "limit" };
  }

  const fields = {
    label: row.label,
    openTime: row.openTime,
    closeTime: row.closeTime,
    closed: row.closed,
  };
  await prisma.vendorHoursOverride.upsert({
    where: { vendorId_date: { vendorId, date } },
    create: { vendorId, date, ...fields },
    update: fields,
  });
  return { ok: true };
}

/**
 * #1060 — delete one override. Scoped by `vendorId` as well as `id`, so an id belonging to
 * another vendor deletes nothing.
 */
export async function deleteVendorHoursOverride(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
) {
  await prisma.vendorHoursOverride.deleteMany({ where: { id, vendorId } });
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
 * Delete a custom theme saved by this vendor (#1385).
 * Uses deleteMany with explicit vendorId scoping so another vendor's theme cannot be touched.
 */
export async function deleteVendorTheme(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  themeId: string,
) {
  return prisma.vendorTheme.deleteMany({
    where: { id: themeId, vendorId },
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

/**
 * #1134 — the marketing-consent switch, owned by `/staff/storefront`. Same shape as
 * `setVendorAssistantEnabled`: a singular, childless `update` on this vendor's own config row.
 * Returns the number of rows changed (0 for an unseeded vendor with no config row).
 */
export async function setVendorMarketingConsentEnabled(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  enabled: boolean,
): Promise<number> {
  const existing = await prisma.vendorConfig.findUnique({
    where: { vendorId },
    select: { id: true },
  });
  if (!existing) return 0;
  await prisma.vendorConfig.update({
    where: { vendorId },
    data: { marketingConsentEnabled: enabled },
  });
  return 1;
}
