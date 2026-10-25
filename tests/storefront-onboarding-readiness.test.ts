import { describe, expect, it } from "vitest";
import {
  evaluateVendorReadinessData,
  type VendorReadinessReport,
} from "../lib/vendor-readiness-service";
import type { RawVendorOnboardingData } from "../lib/repositories/vendor-readiness";

function makeEmptyVendorData(): RawVendorOnboardingData {
  return {
    vendor: {
      id: "test-empty-vendor",
      slug: "empty-vendor",
      name: "",
      status: "ACTIVE",
    },
    branding: null,
    config: null,
    location: null,
    deliveryAreas: [],
    fulfilmentSlotsCount: 0,
    expressScheduleCount: 0,
    weeklyHours: [],
    paymentBadges: [],
    reviewLinksCount: 0,
    domain: null,
    productCount: 0,
    categoryCount: 0,
    staffCount: 0,
  };
}

function makeReferenceVendorData(): RawVendorOnboardingData {
  return {
    vendor: {
      id: "a4ed0000-0000-4000-a000-000000000001",
      slug: "aheed-food-centre",
      name: "Aheed Food Centre",
      status: "ACTIVE",
    },
    branding: {
      name: "Aheed Food Centre",
      tagline: "Fresh halal meat, produce & cultural groceries — delivered across Milton Keynes",
      logoStorageKey: "vendors/a4ed/logo.png",
      markStorageKey: "vendors/a4ed/mark-1/512.png",
      brandGreenDark: "#1b5e20",
      brandGreen: "#4caf50",
      brandOrange: "#f57c00",
      brandRed: "#d32f2f",
      brandCream: "#f5f5f0",
      brandGreenTint: "#e8f5e9",
      brandOrangeTint: "#fff3e0",
      brandRedTint: "#ffebee",
      themeId: "theme-1",
    },
    config: {
      localityName: "Milton Keynes",
      senderName: "Aheed Food Centre",
      senderEmail: "orders@aheedfoodcentre.nocaped.com",
      searchPlaceholder: "Search halal lamb, basmati, lentils…",
      bannerHeadline: null,
      bannerNote: "100% Certified HMC Halal Fresh Meat Cut Daily",
      heroSubtitle:
        "Delivering fresh groceries straight to your door with our own dedicated delivery team.",
      storeDescription: "South Asian groceries, halal meat and fresh produce.",
      facebookUrl: "https://facebook.com/aheed",
      instagramUrl: "https://instagram.com/aheed",
      whatsappNumber: "447123456789",
      whatsappCommunityUrl: "https://chat.whatsapp.com/test",
      whatsappCommunityQrKey: "vendors/a4ed/whatsapp-qr.png",
      contactPhone: "01908 239130",
      contactEmail: "orders@aheedfoodcentre.nocaped.com",
      companyNumber: "12345678",
      vatNumber: "GB123456789",
      registeredOffice: "13 N 11th St, Milton Keynes",
      openingHoursNote: "Click & Collect orders are ready to pick up during opening hours.",
      showSecureCheckoutNote: true,
      deliveryFeePence: 349,
      freeDeliveryThresholdPence: 3000,
      minimumOrderPence: 1500,
      collectionMinimumOrderPence: 0,
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
      productGridDensity: "STANDARD",
      aiDailyNeuronBudget: 3000,
    },
    location: {
      addressLine1: "13 N 11th St",
      addressLine2: null,
      city: "Milton Keynes",
      postcode: "MK9 3BU",
    },
    deliveryAreas: [{ prefix: "MK" }],
    fulfilmentSlotsCount: 4,
    expressScheduleCount: 7,
    weeklyHours: [
      { dayOfWeek: 1, openTime: "09:00", closeTime: "20:00", closed: false },
      { dayOfWeek: 2, openTime: "09:00", closeTime: "20:00", closed: false },
    ],
    paymentBadges: [
      { method: "VISA" },
      { method: "MASTERCARD" },
      { method: "AMEX" },
      { method: "APPLE_PAY" },
      { method: "GOOGLE_PAY" },
    ],
    reviewLinksCount: 2,
    domain: { host: "aheedfoodcentre.nocaped.com", isCanonical: true },
    productCount: 2045,
    categoryCount: 24,
    staffCount: 2,
  };
}

describe("Storefront Onboarding Readiness Evaluation (Issue #1267)", () => {
  it("evaluates all 8 required categories", () => {
    const report = evaluateVendorReadinessData(makeEmptyVendorData(), "test-empty-vendor");
    expect(report.categories).toHaveLength(8);
    const categoryIds = report.categories.map((c) => c.id);
    expect(categoryIds).toEqual([
      "identity",
      "theme",
      "copy-badges",
      "fulfilment",
      "footer-legal",
      "communication",
      "catalogue-safeguards",
      "infrastructure",
    ]);
  });

  it("marks an empty vendor as IN_PROGRESS with low completion", () => {
    const report = evaluateVendorReadinessData(makeEmptyVendorData(), "test-empty-vendor");
    expect(report.readinessStatus).toBe("IN_PROGRESS");
    expect(report.overallCompletion).toBeLessThan(50);
    expect(report.configuredRequiredSettings).toBeLessThan(report.totalRequiredSettings);

    const identityCat = report.categories.find((c) => c.id === "identity");
    expect(identityCat?.items.find((i) => i.id === "store_name")?.status).toBe("MISSING");
    expect(identityCat?.items.find((i) => i.id === "logo")?.status).toBe("MISSING");
  });

  it("marks the reference canonical profile as LAUNCH_READY with 100% completion", () => {
    const report = evaluateVendorReadinessData(makeReferenceVendorData(), "a4ed-reference");
    expect(report.readinessStatus).toBe("LAUNCH_READY");
    expect(report.overallCompletion).toBe(100);
    expect(report.configuredRequiredSettings).toBe(report.totalRequiredSettings);

    for (const cat of report.categories) {
      expect(cat.completionPercentage).toBe(100);
      for (const item of cat.items) {
        if (item.required && !item.isPlanned) {
          expect(item.status).toBe("CONFIGURED");
        }
      }
    }
  });

  it("marks a partially configured vendor as NEEDS_ATTENTION", () => {
    const data = makeReferenceVendorData();
    // Remove delivery areas and trading hours
    data.deliveryAreas = [];
    data.weeklyHours = [];
    data.location = null;

    const report = evaluateVendorReadinessData(data, "a4ed-partial");
    expect(report.readinessStatus).toBe("NEEDS_ATTENTION");
    expect(report.overallCompletion).toBeGreaterThanOrEqual(60);
    expect(report.overallCompletion).toBeLessThan(100);
  });

  it("segregates planned infrastructure features from immediate in-app configuration", () => {
    const report = evaluateVendorReadinessData(makeReferenceVendorData(), "a4ed-reference");
    const infraCat = report.categories.find((c) => c.id === "infrastructure");
    expect(infraCat).toBeDefined();

    const plannedItems = infraCat?.items.filter((i) => i.isPlanned);
    expect(plannedItems).toHaveLength(3);
    const plannedIds = plannedItems?.map((i) => i.id);
    expect(plannedIds).toContain("outgoing_email_service");
    expect(plannedIds).toContain("live_stripe_keys");
    expect(plannedIds).toContain("external_apex_dns");

    for (const item of plannedItems!) {
      expect(item.status).toBe("PLANNED");
      expect(item.required).toBe(false);
      expect(item.editHref).toBeNull();
    }
  });

  it("generates actionable deep links for configurable items", () => {
    const report = evaluateVendorReadinessData(makeReferenceVendorData(), "a4ed-reference");
    const actionable = report.categories.flatMap((c) => c.items).filter((i) => i.editHref !== null);
    expect(actionable.length).toBeGreaterThan(15);
    for (const item of actionable) {
      expect(item.editHref).toMatch(/^\/staff\//);
    }
  });

  it("segregates configuration responsibility between store operator and platform admin (#1269)", () => {
    const report = evaluateVendorReadinessData(makeReferenceVendorData(), "a4ed-reference");
    const allItems = report.categories.flatMap((c) => c.items);

    // Every item has an explicit owner
    for (const item of allItems) {
      expect(["VENDOR_OPERATOR", "PLATFORM_ADMIN"]).toContain(item.owner);
    }

    const platformItems = allItems.filter((i) => i.owner === "PLATFORM_ADMIN");
    expect(platformItems.length).toBeGreaterThanOrEqual(4);
    const platformIds = platformItems.map((i) => i.id);
    expect(platformIds).toContain("domain_routing");
    expect(platformIds).toContain("ai_neuron_allowance");
    expect(platformIds).toContain("outgoing_email_service");
    expect(platformIds).toContain("live_stripe_keys");

    // Report provides broken-down counts
    expect(report.vendorRequiredCount).toBeGreaterThan(0);
    expect(report.vendorConfiguredCount).toBe(report.vendorRequiredCount);
    expect(report.platformRequiredCount).toBeGreaterThan(0);
    expect(report.platformConfiguredCount).toBe(report.platformRequiredCount);
    expect(report.vendorRequiredCount + report.platformRequiredCount).toBe(
      report.totalRequiredSettings,
    );
  });
});
