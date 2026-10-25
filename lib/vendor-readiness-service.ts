import { getPrisma } from "@/lib/db";
import {
  fetchRawVendorOnboardingData,
  type RawVendorOnboardingData,
} from "@/lib/repositories/vendor-readiness";

export type SettingStatus = "CONFIGURED" | "MISSING" | "OPTIONAL" | "PLANNED";
export type LaunchReadinessStatus = "LAUNCH_READY" | "NEEDS_ATTENTION" | "IN_PROGRESS";

export interface ReadinessSetting {
  id: string;
  name: string;
  category: string;
  currentValue: string | null;
  referenceValue: string;
  status: SettingStatus;
  required: boolean;
  validationRule: string;
  editHref: string | null;
  isPlanned: boolean;
}

export interface ReadinessCategory {
  id: string;
  name: string;
  description: string;
  items: ReadinessSetting[];
  totalRequired: number;
  configuredRequired: number;
  completionPercentage: number;
}

export interface VendorReadinessReport {
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  canonicalHost: string | null;
  overallCompletion: number;
  totalRequiredSettings: number;
  configuredRequiredSettings: number;
  readinessStatus: LaunchReadinessStatus;
  categories: ReadinessCategory[];
  evaluatedAt: string;
}

function hexColorValid(c: string | undefined): boolean {
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
}

export function evaluateVendorReadinessData(
  data: RawVendorOnboardingData,
  vendorId: string,
): VendorReadinessReport {
  const vendor = data.vendor;
  const branding = data.branding;
  const config = data.config;
  const location = data.location;
  const deliveryAreas = data.deliveryAreas;
  const weeklyHours = data.weeklyHours;
  const paymentBadges = data.paymentBadges;

  // 1. Storefront Identity & Chrome
  const identityItems: ReadinessSetting[] = [
    {
      id: "store_name",
      name: "Store Display Name",
      category: "Storefront Identity & Chrome",
      currentValue: vendor?.name || null,
      referenceValue: "Aheed Food Centre",
      status: vendor?.name?.trim() ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Non-empty public store title",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "tagline",
      name: "Storefront Tagline",
      category: "Storefront Identity & Chrome",
      currentValue: branding?.tagline || null,
      referenceValue: "Fresh halal meat, produce & cultural groceries — delivered across Milton Keynes",
      status: branding?.tagline?.trim() ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Descriptive brand proposition (max 150 chars)",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "locality",
      name: "Locality Anchor Name",
      category: "Storefront Identity & Chrome",
      currentValue: config?.localityName || null,
      referenceValue: "Milton Keynes",
      status: config?.localityName?.trim() ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Town or market area anchor",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "logo",
      name: "Store Logo",
      category: "Storefront Identity & Chrome",
      currentValue: branding?.logoStorageKey ? "Uploaded (Storage Key)" : null,
      referenceValue: "vendors/{id}/logo.png (uploaded)",
      status: branding?.logoStorageKey ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Uploaded relative image storage key",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "mark",
      name: "App Icon / Square Mark",
      category: "Storefront Identity & Chrome",
      currentValue: branding?.markStorageKey ? "Configured (512px icon)" : null,
      referenceValue: "vendors/{id}/mark-.../512.png",
      status: branding?.markStorageKey ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Optional 512px PNG for PWA & favicon",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "search_placeholder",
      name: "Search Input Placeholder",
      category: "Storefront Identity & Chrome",
      currentValue: config?.searchPlaceholder || null,
      referenceValue: "Search halal lamb, basmati, lentils…",
      status: config?.searchPlaceholder?.trim() ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Custom prompt text for the search bar",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "banner_headline",
      name: "Header Top Banner Headline",
      category: "Storefront Identity & Chrome",
      currentValue: config?.bannerHeadline || "Dynamic (Derived)",
      referenceValue: "Dynamic (Derived from store name)",
      status: "CONFIGURED",
      required: false,
      validationRule: "Top headline or auto-derived locality text",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "banner_note",
      name: "Header Announcement Note",
      category: "Storefront Identity & Chrome",
      currentValue: config?.bannerNote || null,
      referenceValue: "100% Certified HMC Halal Fresh Meat Cut Daily",
      status: config?.bannerNote?.trim() ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Optional top promo/dispatch note",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
  ];

  // 2. Visual Theme & Brand Primitives
  const all8Hex =
    hexColorValid(branding?.brandGreenDark) &&
    hexColorValid(branding?.brandGreen) &&
    hexColorValid(branding?.brandOrange) &&
    hexColorValid(branding?.brandRed) &&
    hexColorValid(branding?.brandCream) &&
    hexColorValid(branding?.brandGreenTint) &&
    hexColorValid(branding?.brandOrangeTint) &&
    hexColorValid(branding?.brandRedTint);

  const themeItems: ReadinessSetting[] = [
    {
      id: "brand_colors",
      name: "8 Brand Hex Primitives",
      category: "Visual Theme & Brand Primitives",
      currentValue: all8Hex ? "All 8 #rrggbb tokens configured" : "Incomplete",
      referenceValue: "#1b5e20, #4caf50, #f57c00, #d32f2f, #f5f5f0...",
      status: all8Hex ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Eight valid #rrggbb hex colour codes",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "brand_contrast",
      name: "WCAG AA Contrast Check",
      category: "Visual Theme & Brand Primitives",
      currentValue: "Protected (Runtime brandStyle clamp)",
      referenceValue: "Passes 4.5:1 text contrast clamp",
      status: "CONFIGURED",
      required: true,
      validationRule: "Automated contrast-clamp in lib/vendor-theme.ts",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "theme_preset",
      name: "Theme Preset Reference",
      category: "Visual Theme & Brand Primitives",
      currentValue: branding?.themeId ? "Curated Theme Copied" : "Custom Palette",
      referenceValue: "Custom curated palette",
      status: "CONFIGURED",
      required: false,
      validationRule: "Optional theme selector in storefront admin",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
  ];

  // 3. Storefront Copy & Badges
  const dietaryAny =
    config?.showHalalLabel ||
    config?.showFreshLabel ||
    config?.showOrganicLabel ||
    config?.showVegetarianLabel ||
    config?.showGlutenFreeLabel ||
    config?.showHmcCertification;

  const copyItems: ReadinessSetting[] = [
    {
      id: "hero_subtitle",
      name: "Hero Supporting Copy",
      category: "Storefront Copy & Badges",
      currentValue: config?.heroSubtitle || null,
      referenceValue: "Delivering fresh groceries straight to your door with our own dedicated delivery team.",
      status: config?.heroSubtitle?.trim() ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Homepage hero narrative text",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "store_description",
      name: "Store Description (AI Context)",
      category: "Storefront Copy & Badges",
      currentValue: config?.storeDescription || null,
      referenceValue: "South Asian groceries, halal meat and fresh produce...",
      status: config?.storeDescription?.trim() ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Store context framing for AI assistant & synonyms",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "dietary_labels",
      name: "Dietary & Certification Badges",
      category: "Storefront Copy & Badges",
      currentValue: dietaryAny ? "Badges enabled" : "None enabled",
      referenceValue: "Halal, Fresh, Organic, Vegetarian, Gluten-Free, HMC enabled",
      status: dietaryAny ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "At least one product dietary/certification badge configured",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "grid_density",
      name: "Product Grid Density",
      category: "Storefront Copy & Badges",
      currentValue: config?.productGridDensity || "STANDARD",
      referenceValue: "STANDARD",
      status: "CONFIGURED",
      required: false,
      validationRule: "COMPACT, STANDARD, or SPACIOUS layout",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
  ];

  // 4. Fulfilment & Delivery
  const hasDeliveryAreas = deliveryAreas.length > 0;
  const deliveryItems: ReadinessSetting[] = [
    {
      id: "delivery_fee",
      name: "Standard Delivery Fee",
      category: "Fulfilment & Delivery",
      currentValue: config ? `£${(config.deliveryFeePence / 100).toFixed(2)}` : null,
      referenceValue: "£3.49",
      status: typeof config?.deliveryFeePence === "number" ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Non-negative integer pence",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "minimum_order",
      name: "Delivery Minimum Order Value",
      category: "Fulfilment & Delivery",
      currentValue: config ? `£${(config.minimumOrderPence / 100).toFixed(2)}` : null,
      referenceValue: "£15.00",
      status: typeof config?.minimumOrderPence === "number" ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Order floor for delivery checkouts",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "free_delivery_threshold",
      name: "Free Delivery Spend Threshold",
      category: "Fulfilment & Delivery",
      currentValue:
        config?.freeDeliveryThresholdPence !== null && config?.freeDeliveryThresholdPence !== undefined
          ? `£${(config.freeDeliveryThresholdPence / 100).toFixed(2)}`
          : "Not offered",
      referenceValue: "£30.00",
      status: config?.freeDeliveryThresholdPence ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Spend threshold to waive delivery fees",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "collection_settings",
      name: "Click & Collect Minimum",
      category: "Fulfilment & Delivery",
      currentValue: config?.offerCollection
        ? `Offered (£${(config.collectionMinimumOrderPence / 100).toFixed(2)} min)`
        : "Disabled",
      referenceValue: "Offered (£0.00 min)",
      status: config?.offerCollection ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "In-store pickup minimum and toggle",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "delivery_areas",
      name: "Delivery Postcode Areas",
      category: "Fulfilment & Delivery",
      currentValue: hasDeliveryAreas
        ? `${deliveryAreas.length} area(s): ${deliveryAreas.map((a) => a.prefix).slice(0, 5).join(", ")}${deliveryAreas.length > 5 ? "..." : ""}`
        : null,
      referenceValue: "MK (Milton Keynes outward prefixes)",
      status: hasDeliveryAreas ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "At least one outward postcode prefix allowed for delivery",
      editHref: "/staff/delivery-areas",
      isPlanned: false,
    },
    {
      id: "fulfilment_slots",
      name: "Scheduled Delivery Windows",
      category: "Fulfilment & Delivery",
      currentValue: data.fulfilmentSlotsCount > 0 ? `${data.fulfilmentSlotsCount} active slots` : "None configured",
      referenceValue: "Configured daily time windows",
      status: data.fulfilmentSlotsCount > 0 ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Customer booking slots for delivery",
      editHref: "/staff/fulfilment",
      isPlanned: false,
    },
    {
      id: "express_schedule",
      name: "Express Collection Hours",
      category: "Fulfilment & Delivery",
      currentValue: data.expressScheduleCount > 0 ? `${data.expressScheduleCount} active schedules` : "None configured",
      referenceValue: "Configured daily collection hours",
      status: data.expressScheduleCount > 0 ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Opening hours for same-day Click & Collect",
      editHref: "/staff/fulfilment",
      isPlanned: false,
    },
  ];

  // 5. Footer, Location & Legal Compliance
  const hasLocation = Boolean(location?.addressLine1 && location?.city && location?.postcode);
  const hasHours = weeklyHours.length > 0;
  const hasBadges = paymentBadges.length > 0;

  const footerItems: ReadinessSetting[] = [
    {
      id: "physical_address",
      name: "Store Physical Address",
      category: "Footer, Location & Legal Compliance",
      currentValue: hasLocation
        ? `${location?.addressLine1}, ${location?.city}, ${location?.postcode}`
        : null,
      referenceValue: "13 N 11th St, Milton Keynes, MK9 3BU",
      status: hasLocation ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Valid street, town/city and UK postcode",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "contact_phone",
      name: "Customer Contact Phone",
      category: "Footer, Location & Legal Compliance",
      currentValue: config?.contactPhone || null,
      referenceValue: "01908 239130",
      status: config?.contactPhone?.trim() ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Published store support telephone",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "contact_email",
      name: "Customer Contact Email",
      category: "Footer, Location & Legal Compliance",
      currentValue: config?.contactEmail || null,
      referenceValue: "orders@aheedfoodcentre.nocaped.com",
      status: config?.contactEmail?.trim() && !config.contactEmail.includes("[") ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Valid contact email (no placeholder brackets)",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "company_number",
      name: "Company Registration Number",
      category: "Footer, Location & Legal Compliance",
      currentValue: config?.companyNumber && !config.companyNumber.includes("[") ? config.companyNumber : "Unset",
      referenceValue: "Companies House 8-digit code",
      status: config?.companyNumber && !config.companyNumber.includes("[") ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Required by UK law if operating as Limited Company / LLP",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "vat_number",
      name: "VAT Registration Number",
      category: "Footer, Location & Legal Compliance",
      currentValue: config?.vatNumber && !config.vatNumber.includes("[") ? config.vatNumber : "Unset",
      referenceValue: "HMRC VAT registration number",
      status: config?.vatNumber && !config.vatNumber.includes("[") ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Required if VAT registered",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "registered_office",
      name: "Registered Office Address",
      category: "Footer, Location & Legal Compliance",
      currentValue: config?.registeredOffice || "Unset",
      referenceValue: "Official registered business address",
      status: config?.registeredOffice ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Statutory company disclosure in footer",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "weekly_hours",
      name: "7-Day Trading Schedule",
      category: "Footer, Location & Legal Compliance",
      currentValue: hasHours ? `${weeklyHours.length} day(s) configured` : null,
      referenceValue: "Mon–Sat 09:00–20:00, Sun 09:00–19:00",
      status: hasHours ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "At least one operating day defined in schedule",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "payment_badges",
      name: "Accepted Payment Badges",
      category: "Footer, Location & Legal Compliance",
      currentValue: hasBadges ? paymentBadges.map((b) => b.method).join(", ") : null,
      referenceValue: "VISA, MASTERCARD, AMEX, APPLE_PAY, GOOGLE_PAY",
      status: hasBadges ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "At least one accepted payment card/method badge enabled",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
  ];

  // 6. Customer Engagement & Communication
  const commItems: ReadinessSetting[] = [
    {
      id: "whatsapp_number",
      name: "WhatsApp Support Number",
      category: "Customer Communication & Community",
      currentValue: config?.whatsappNumber || "Unset",
      referenceValue: "E.164 digits without +",
      status: config?.whatsappNumber ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Enables wa.me direct customer message link",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "whatsapp_community",
      name: "WhatsApp Community Link & QR",
      category: "Customer Communication & Community",
      currentValue:
        config?.whatsappCommunityUrl && config?.whatsappCommunityQrKey ? "Active (Invite URL & QR)" : "Not active",
      referenceValue: "Invite URL + uploaded QR key",
      status: config?.whatsappCommunityUrl ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "Group link for VIP offers and announcements",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "marketing_consent",
      name: "Marketing Consent Opt-In",
      category: "Customer Communication & Community",
      currentValue: config?.marketingConsentEnabled ? "Enabled" : "Disabled (Default Off)",
      referenceValue: "Enabled on registration",
      status: "CONFIGURED",
      required: false,
      validationRule: "GDPR marketing opt-in checkbox",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
    {
      id: "ai_assistant",
      name: "AI Guided Help Assistant",
      category: "Customer Communication & Community",
      currentValue: config?.assistantEnabled ? "Enabled" : "Disabled (Dark)",
      referenceValue: "Enabled (requires WhatsApp number)",
      status: "CONFIGURED",
      required: false,
      validationRule: "Interactive storefront assistance bot",
      editHref: "/staff/assistant",
      isPlanned: false,
    },
    {
      id: "review_links",
      name: "Customer Review Platforms",
      category: "Customer Communication & Community",
      currentValue: data.reviewLinksCount > 0 ? `${data.reviewLinksCount} platform(s)` : "None added",
      referenceValue: "Google / Trustpilot verified links",
      status: data.reviewLinksCount > 0 ? "CONFIGURED" : "OPTIONAL",
      required: false,
      validationRule: "External reputation and rating links",
      editHref: "/staff/storefront",
      isPlanned: false,
    },
  ];

  // 7. Catalogue, Inventory & Safeguards
  const hasProducts = data.productCount > 0;
  const hasCategories = data.categoryCount > 0;

  const catalogueItems: ReadinessSetting[] = [
    {
      id: "stock_file_upload",
      name: "Stock File Importer",
      category: "Catalogue & ADR-007 Inventory Safeguards",
      currentValue: "Active (/staff/products/import)",
      referenceValue: "Two-phase in-memory preview with ADR-007 safeguards",
      status: "CONFIGURED",
      required: true,
      validationRule: "Client-side Excel/CSV parsing engine",
      editHref: "/staff/products/import",
      isPlanned: false,
    },
    {
      id: "catalogue_items",
      name: "Catalogue Inventory Records",
      category: "Catalogue & ADR-007 Inventory Safeguards",
      currentValue: hasProducts
        ? `${data.productCount} product(s) across ${data.categoryCount} category(s)`
        : "Empty Catalogue (0 items)",
      referenceValue: "2045 products across curated categories",
      status: hasProducts && hasCategories ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Storefront requires at least one imported product and category",
      editHref: "/staff/products",
      isPlanned: false,
    },
    {
      id: "unknown_stock_invariant",
      name: "Stock UNKNOWN Invariant",
      category: "Catalogue & ADR-007 Inventory Safeguards",
      currentValue: "Enforced (All imports default to UNKNOWN, quantity 0)",
      referenceValue: "Zero negative till numbers imported as live stock",
      status: "CONFIGURED",
      required: true,
      validationRule: "ADR-007 stock isolation prevents phantom inventory",
      editHref: "/staff/products/import",
      isPlanned: false,
    },
    {
      id: "restrictions_policy",
      name: "ADR-007 Restrictions Audit",
      category: "Catalogue & ADR-007 Inventory Safeguards",
      currentValue: "Enforced (Alcohol/Tobacco age-restricted, Lottery prohibited)",
      referenceValue: "Audited classification in ProductRestrictionAuditLog",
      status: "CONFIGURED",
      required: true,
      validationRule: "Compliance blocks on restricted merchandise",
      editHref: "/staff/products",
      isPlanned: false,
    },
  ];

  // 8. Platform Infrastructure & Governance
  const hasDomain = Boolean(data.domain?.host);
  const hasStaff = data.staffCount > 0;

  const infraItems: ReadinessSetting[] = [
    {
      id: "domain_routing",
      name: "Host Domain Mapping",
      category: "Platform Infrastructure & Governance",
      currentValue: data.domain?.host ? data.domain.host : "Unmapped",
      referenceValue: "aheedfoodcentre.nocaped.com",
      status: hasDomain ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "VendorDomain row mapped and custom domain routed in wrangler.toml",
      editHref: null,
      isPlanned: false,
    },
    {
      id: "staff_admin_users",
      name: "Staff Admin Accounts",
      category: "Platform Infrastructure & Governance",
      currentValue: hasStaff ? `${data.staffCount} member(s)` : null,
      referenceValue: "At least 1 verified ADMIN account",
      status: hasStaff ? "CONFIGURED" : "MISSING",
      required: true,
      validationRule: "Store management user with ADMIN role in VendorMembership",
      editHref: "/staff/team",
      isPlanned: false,
    },
    {
      id: "ai_neuron_allowance",
      name: "Daily AI Neuron Allowance",
      category: "Platform Infrastructure & Governance",
      currentValue: config?.aiDailyNeuronBudget ? `${config.aiDailyNeuronBudget} neurons/day` : "3000 neurons/day",
      referenceValue: "3000 neurons/day",
      status: "CONFIGURED",
      required: true,
      validationRule: "Cloudflare Workers AI daily rate-limiting ceiling",
      editHref: "/staff/ai-usage",
      isPlanned: false,
    },
    {
      id: "outgoing_email_service",
      name: "Cloudflare Email Sending Adapter",
      category: "Platform Infrastructure & Governance",
      currentValue: "Platform Shared Sender / Resend Fallback",
      referenceValue: "Provider-agnostic EmailService with CF Sending (#1217)",
      status: "PLANNED",
      required: false,
      validationRule: "Planned feature #1217 (per-vendor sender isolation)",
      editHref: null,
      isPlanned: true,
    },
    {
      id: "live_stripe_keys",
      name: "Live Stripe Connected Account",
      category: "Platform Infrastructure & Governance",
      currentValue: "Platform Untraded Account (Blocked on live keys)",
      referenceValue: "Platform Stripe keys / Connected Account (#113)",
      status: "PLANNED",
      required: false,
      validationRule: "Owner-gated release blocker #113",
      editHref: null,
      isPlanned: true,
    },
    {
      id: "external_apex_dns",
      name: "Client Apex Domain DNS",
      category: "Platform Infrastructure & Governance",
      currentValue: "Staging Host (aheedsuperstore-staging.nocaped.com)",
      referenceValue: "Active Cloudflare zone + NS delegation (#104)",
      status: "PLANNED",
      required: false,
      validationRule: "Owner-gated registrar cutover",
      editHref: null,
      isPlanned: true,
    },
  ];

  // Helper to compile categories
  function compileCategory(id: string, name: string, description: string, items: ReadinessSetting[]): ReadinessCategory {
    const requiredItems = items.filter((i) => i.required && !i.isPlanned);
    const configuredRequired = requiredItems.filter((i) => i.status === "CONFIGURED").length;
    const completionPercentage =
      requiredItems.length > 0 ? Math.round((configuredRequired / requiredItems.length) * 100) : 100;

    return {
      id,
      name,
      description,
      items,
      totalRequired: requiredItems.length,
      configuredRequired,
      completionPercentage,
    };
  }

  const categories: ReadinessCategory[] = [
    compileCategory(
      "identity",
      "Storefront Identity & Chrome",
      "Store title, branding copy, locality, logo, and announcement banners.",
      identityItems,
    ),
    compileCategory(
      "theme",
      "Visual Theme & Brand Primitives",
      "Eight brand colour hex tokens and WCAG AA contrast compliance.",
      themeItems,
    ),
    compileCategory(
      "copy-badges",
      "Storefront Copy & Badges",
      "Hero subtitle, AI description framing, and dietary / certification badge toggles.",
      copyItems,
    ),
    compileCategory(
      "fulfilment",
      "Fulfilment & Delivery",
      "Delivery fee, minimum order value, free threshold, and outward postcode areas.",
      deliveryItems,
    ),
    compileCategory(
      "footer-legal",
      "Footer, Location & Legal Compliance",
      "Physical trading address, contact phone/email, trading hours, and payment badges.",
      footerItems,
    ),
    compileCategory(
      "communication",
      "Customer Communication & Community",
      "WhatsApp direct number, VIP community invite & QR, marketing consent, and reviews.",
      commItems,
    ),
    compileCategory(
      "catalogue-safeguards",
      "Catalogue & ADR-007 Inventory Safeguards",
      "Stock file upload workflow, hidden product defaults, UNKNOWN stock state, and restrictions audit.",
      catalogueItems,
    ),
    compileCategory(
      "infrastructure",
      "Platform Infrastructure & Governance",
      "Worker custom domain routing, staff admin roles, and external/planned service dependencies.",
      infraItems,
    ),
  ];

  const totalRequiredSettings = categories.reduce((sum, c) => sum + c.totalRequired, 0);
  const configuredRequiredSettings = categories.reduce((sum, c) => sum + c.configuredRequired, 0);
  const overallCompletion =
    totalRequiredSettings > 0 ? Math.round((configuredRequiredSettings / totalRequiredSettings) * 100) : 100;

  let readinessStatus: LaunchReadinessStatus = "IN_PROGRESS";
  if (overallCompletion === 100) {
    readinessStatus = "LAUNCH_READY";
  } else if (overallCompletion >= 60) {
    readinessStatus = "NEEDS_ATTENTION";
  }

  return {
    vendorId,
    vendorName: vendor?.name || "Unconfigured Vendor",
    vendorSlug: vendor?.slug || "unnamed",
    canonicalHost: data.domain?.host || null,
    overallCompletion,
    totalRequiredSettings,
    configuredRequiredSettings,
    readinessStatus,
    categories,
    evaluatedAt: new Date().toISOString(),
  };
}

export async function evaluateVendorReadiness(vendorId: string): Promise<VendorReadinessReport> {
  const prisma = getPrisma();
  const rawData = await fetchRawVendorOnboardingData(prisma, vendorId);
  return evaluateVendorReadinessData(rawData, vendorId);
}
