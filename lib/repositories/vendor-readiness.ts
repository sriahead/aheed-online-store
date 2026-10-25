import type { getPrisma } from "@/lib/db";

/**
 * Raw database query model for Vendor Onboarding Readiness (#1267).
 *
 * Adheres to repository purity rules (tests/repository-purity.test.ts and
 * tests/repository-client-injection.test.ts):
 * - Takes Prisma client and vendorId explicitly.
 * - Imports zero request context.
 */

export interface RawVendorOnboardingData {
  vendor: {
    id: string;
    slug: string;
    name: string;
    status: string;
  } | null;
  branding: {
    name: string;
    tagline: string | null;
    logoStorageKey: string | null;
    markStorageKey: string | null;
    brandGreenDark: string;
    brandGreen: string;
    brandOrange: string;
    brandRed: string;
    brandCream: string;
    brandGreenTint: string;
    brandOrangeTint: string;
    brandRedTint: string;
    themeId: string | null;
  } | null;
  config: {
    localityName: string;
    senderName: string;
    senderEmail: string;
    searchPlaceholder: string | null;
    bannerHeadline: string | null;
    bannerNote: string | null;
    heroSubtitle: string | null;
    storeDescription: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    whatsappNumber: string | null;
    whatsappCommunityUrl: string | null;
    whatsappCommunityQrKey: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    companyNumber: string | null;
    vatNumber: string | null;
    registeredOffice: string | null;
    openingHoursNote: string | null;
    showSecureCheckoutNote: boolean;
    deliveryFeePence: number;
    freeDeliveryThresholdPence: number | null;
    minimumOrderPence: number;
    collectionMinimumOrderPence: number;
    offerCollection: boolean;
    loyaltyEnabled: boolean;
    assistantEnabled: boolean;
    marketingConsentEnabled: boolean;
    showHalalLabel: boolean;
    showFreshLabel: boolean;
    showOrganicLabel: boolean;
    showVegetarianLabel: boolean;
    showGlutenFreeLabel: boolean;
    showHmcCertification: boolean;
    productGridDensity: string;
    aiDailyNeuronBudget: number;
  } | null;
  location: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    postcode: string;
  } | null;
  deliveryAreas: { prefix: string }[];
  fulfilmentSlotsCount: number;
  expressScheduleCount: number;
  weeklyHours: {
    dayOfWeek: number;
    openTime: string | null;
    closeTime: string | null;
    closed: boolean;
  }[];
  paymentBadges: { method: string }[];
  reviewLinksCount: number;
  domain: { host: string; isCanonical: boolean } | null;
  productCount: number;
  categoryCount: number;
  staffCount: number;
}

export async function fetchRawVendorOnboardingData(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<RawVendorOnboardingData> {
  const [
    vendor,
    branding,
    config,
    location,
    deliveryAreas,
    fulfilmentSlotsCount,
    expressScheduleCount,
    weeklyHours,
    paymentBadges,
    reviewLinksCount,
    domain,
    productCount,
    categoryCount,
    staffCount,
  ] = await Promise.all([
    prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, slug: true, name: true, status: true },
    }),
    prisma.vendorBranding.findUnique({
      where: { vendorId },
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
        themeId: true,
      },
    }),
    prisma.vendorConfig.findUnique({
      where: { vendorId },
      select: {
        localityName: true,
        senderName: true,
        senderEmail: true,
        searchPlaceholder: true,
        bannerHeadline: true,
        bannerNote: true,
        heroSubtitle: true,
        storeDescription: true,
        facebookUrl: true,
        instagramUrl: true,
        whatsappNumber: true,
        whatsappCommunityUrl: true,
        whatsappCommunityQrKey: true,
        contactPhone: true,
        contactEmail: true,
        companyNumber: true,
        vatNumber: true,
        registeredOffice: true,
        openingHoursNote: true,
        showSecureCheckoutNote: true,
        deliveryFeePence: true,
        freeDeliveryThresholdPence: true,
        minimumOrderPence: true,
        collectionMinimumOrderPence: true,
        offerCollection: true,
        loyaltyEnabled: true,
        assistantEnabled: true,
        marketingConsentEnabled: true,
        showHalalLabel: true,
        showFreshLabel: true,
        showOrganicLabel: true,
        showVegetarianLabel: true,
        showGlutenFreeLabel: true,
        showHmcCertification: true,
        productGridDensity: true,
        aiDailyNeuronBudget: true,
      },
    }),
    prisma.vendorLocation.findUnique({
      where: { vendorId },
      select: { addressLine1: true, addressLine2: true, city: true, postcode: true },
    }),
    prisma.vendorDeliveryArea.findMany({
      where: { vendorId },
      select: { prefix: true },
      orderBy: { prefix: "asc" },
    }),
    prisma.vendorFulfilmentSlot.count({
      where: { vendorId },
    }),
    prisma.vendorExpressSchedule.count({
      where: { vendorId },
    }),
    prisma.vendorWeeklyHours.findMany({
      where: { vendorId },
      select: { dayOfWeek: true, openTime: true, closeTime: true, closed: true },
      orderBy: { dayOfWeek: "asc" },
    }),
    prisma.vendorPaymentBadge.findMany({
      where: { vendorId },
      select: { method: true },
    }),
    prisma.vendorReviewLink.count({
      where: { vendorId },
    }),
    prisma.vendorDomain.findFirst({
      where: { vendorId },
      select: { host: true, isCanonical: true },
      orderBy: { isCanonical: "desc" },
    }),
    prisma.product.count({
      where: { vendorId },
    }),
    prisma.category.count({
      where: { vendorId },
    }),
    prisma.vendorMembership.count({
      where: { vendorId },
    }),
  ]);

  return {
    vendor,
    branding,
    config,
    location,
    deliveryAreas,
    fulfilmentSlotsCount,
    expressScheduleCount,
    weeklyHours,
    paymentBadges,
    reviewLinksCount,
    domain,
    productCount,
    categoryCount,
    staffCount,
  };
}
