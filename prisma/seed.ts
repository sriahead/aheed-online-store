import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { getStorage } from "@/lib/storage";

// Seed runs in Node (locally or CI) — prefers DIRECT_URL.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DIRECT_URL/DATABASE_URL is empty in the seed process — check .env is present and loading.",
  );
}
console.log("seed connecting to:", connectionString.replace(/:[^:@/]+@/, ":****@")); // mask password

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

// ADR-004 slice 1 — single tenant for now. Fixed UUID matches the migration's backfill so
// a fresh `migrate deploy` + `db:seed` produces the same vendor as the backfilled envs.
const AHEED_VENDOR_ID = "a4ed0000-0000-4000-a000-000000000001";

async function main() {
  const count = await prisma.healthCheck.count();
  if (count === 0) {
    await prisma.healthCheck.create({ data: { label: "walking-skeleton" } });
    console.log("seeded HealthCheck row");
  } else {
    console.log(`HealthCheck already has ${count} row(s) — skipping`);
  }

  // The migration already creates the Aheed vendor; upsert keeps a from-scratch seed
  // (e.g. after `migrate reset`) idempotent and self-sufficient.
  await prisma.vendor.upsert({
    where: { id: AHEED_VENDOR_ID },
    create: { id: AHEED_VENDOR_ID, slug: "aheed-food-centre", name: "Aheed Food Centre" },
    update: {},
  });

  await seedCatalogue(AHEED_VENDOR_ID, CATALOGUE);
  await refreshProductImages(CATALOGUE);
  await upsertVendorSatellites(AHEED_VENDOR_ID, AHEED_SATELLITES);
  // After the catalogue: bundles resolve their constituents by product slug.
  await seedBundles(AHEED_VENDOR_ID, AHEED_BUNDLES);

  // ADR-004 slice 3b — host→tenant mapping. Hosts are per-environment (staging & prod are
  // separate DBs), sourced from env vars. SriMart (a 2nd vendor) is only seeded when BOTH
  // hosts are present, so the DB is never left as "2 vendors but a vendor has no domain"
  // (which would send Aheed's own host to /coming-soon).
  const aheedHost = process.env.SEED_AHEED_HOST?.trim();
  const srimartHost = process.env.SEED_SRIMART_HOST?.trim();

  if (aheedHost) {
    await upsertVendorDomain(AHEED_VENDOR_ID, aheedHost);
  } else {
    console.log(
      "SEED_AHEED_HOST unset — skipping VendorDomain (single-vendor host fallback stays)",
    );
  }

  if (aheedHost && srimartHost) {
    await prisma.vendor.upsert({
      where: { id: SRIMART_VENDOR_ID },
      create: { id: SRIMART_VENDOR_ID, slug: "srimart", name: "SriMart" },
      update: {},
    });
    await seedCatalogue(SRIMART_VENDOR_ID, SRIMART_CATALOGUE);
    await refreshProductImages(SRIMART_CATALOGUE);
    await upsertVendorSatellites(SRIMART_VENDOR_ID, SRIMART_SATELLITES);
    await seedBundles(SRIMART_VENDOR_ID, SRIMART_BUNDLES);
    await upsertVendorDomain(SRIMART_VENDOR_ID, srimartHost);
  } else if (srimartHost && !aheedHost) {
    console.log("SEED_SRIMART_HOST set but SEED_AHEED_HOST is not — skipping SriMart to stay safe");
  } else if (aheedHost && !srimartHost) {
    // #276 — this was the SILENT path, and it is the one that matters. It leaves a
    // database that looks correctly seeded while holding only one vendor, so every
    // multi-tenant check (per-vendor branding, cross-tenant isolation, SriMart's
    // deliberately different brand colours) silently exercises nothing. Warn loudly
    // rather than exiting non-zero: single-vendor seeding is a legitimate thing to
    // want, it just must not happen by accident.
    console.warn(
      "WARNING: SEED_SRIMART_HOST unset — SriMart was NOT seeded. This database has ONE vendor,\n" +
        "         so any multi-tenant check against it proves nothing. Set SEED_SRIMART_HOST\n" +
        "         (alongside SEED_AHEED_HOST) if you meant to seed both vendors.",
    );
  }
}

async function upsertVendorDomain(vendorId: string, host: string) {
  const normalized = host.toLowerCase();
  await prisma.vendorDomain.upsert({
    where: { host: normalized },
    create: { vendorId, host: normalized, isCanonical: true },
    update: { vendorId, isCanonical: true },
  });
  console.log(`mapped host ${normalized} -> ${vendorId}`);
}

// ADR-004 slice 4 — per-vendor branding/config/delivery satellites (slice 1 shipped
// them empty). Brand primitives mirror the eight --color-brand-* tokens in
// design-system/tokens/tokens.css; injected as CSS custom properties per request.
type VendorSatellites = {
  branding: {
    name: string;
    tagline: string;
    logoStorageKey: string | null;
    brandGreenDark: string;
    brandGreen: string;
    brandOrange: string;
    brandRed: string;
    brandCream: string;
    brandGreenTint: string;
    brandOrangeTint: string;
    brandRedTint: string;
  };
  config: {
    localityName: string;
    senderName: string;
    senderEmail: string;
    searchPlaceholder: string;
    // P7.5c+f — per-vendor storefront copy (#239). Nullable in the schema
    // because a null HIDES its element; both seeded vendors set them.
    bannerNote: string | null;
    heroSubtitle: string | null;
    // P3a — delivery rules are vendor data, not constants. Deliberately
    // different per vendor so the cart proves it reads them from the DB.
    deliveryFeePence: number;
    freeDeliveryThresholdPence: number | null;
    minimumOrderPence: number;
    // P5a — loyalty is vendor data too (#135). Aheed runs a scheme; SriMart
    // deliberately does not, which is what proves the per-vendor switch rather
    // than assuming it.
    loyaltyEnabled: boolean;
    pointsPerPoundEarned: number;
    pencePerPointRedeemed: number;
    minRedeemPoints: number;
    tierWindowDays: number;
    pointsExpiryMonths: number | null;
  };
  deliveryPrefixes: string[];
  loyaltyTiers: {
    key: string;
    name: string;
    thresholdPence: number;
    multiplierBps: number;
    sortOrder: number;
  }[];
  // P5b — discount codes are vendor data too (#145). Aheed gets one sample code;
  // SriMart deliberately gets none, which is what proves codes are per-vendor
  // rather than a platform-wide list.
  discountCodes: {
    code: string;
    description: string;
    kind: "PERCENTAGE" | "FIXED_AMOUNT";
    value: number;
    minSubtotalPence: number;
    remainingRedemptions: number | null;
    maxPerCustomer: number | null;
  }[];
};

async function upsertVendorSatellites(vendorId: string, s: VendorSatellites) {
  await prisma.vendorBranding.upsert({
    where: { vendorId },
    create: { vendorId, ...s.branding },
    update: { ...s.branding },
  });
  await prisma.vendorConfig.upsert({
    where: { vendorId },
    create: { vendorId, ...s.config },
    update: { ...s.config },
  });
  for (const prefix of s.deliveryPrefixes) {
    await prisma.vendorDeliveryArea.upsert({
      where: { vendorId_prefix: { vendorId, prefix } },
      create: { vendorId, prefix },
      update: {},
    });
  }
  // Upsert by (vendorId, key) so re-running never duplicates a tier and never
  // clobbers a threshold an admin has since tuned away from the seed value...
  // except that it does update, deliberately: the seed is the declared baseline,
  // and a staging re-seed resetting tiers to it is the intended behaviour.
  for (const tier of s.loyaltyTiers) {
    await prisma.vendorLoyaltyTier.upsert({
      where: { vendorId_key: { vendorId, key: tier.key } },
      create: { vendorId, ...tier },
      update: {
        name: tier.name,
        thresholdPence: tier.thresholdPence,
        multiplierBps: tier.multiplierBps,
        sortOrder: tier.sortOrder,
      },
    });
  }
  // Unlike the tiers above, `update` is EMPTY on purpose. A tier's threshold is
  // pure configuration, so resetting it to the declared baseline is the intended
  // re-seed behaviour; a code's `remainingRedemptions` counts DOWN as shoppers
  // use it, so rewriting it would silently refill a partly-claimed code and
  // hand out uses that were already spent.
  for (const code of s.discountCodes) {
    await prisma.discountCode.upsert({
      where: { vendorId_code: { vendorId, code: code.code } },
      create: { vendorId, ...code },
      update: {},
    });
  }
  console.log(`seeded branding/config/delivery/loyalty/discounts for ${vendorId}`);
}

// Aheed's primitives are the exact current tokens.css hex; tagline preserves the
// storefront hero headline. Logo lives in object storage (uploaded out-of-band —
// see docs/env-setup.md); until then the header falls back to a wordmark.
const AHEED_SATELLITES: VendorSatellites = {
  branding: {
    name: "Aheed Food Centre",
    tagline: "Fresh halal meat, produce & cultural groceries — delivered across Milton Keynes",
    logoStorageKey: `vendors/${AHEED_VENDOR_ID}/logo.png`,
    brandGreenDark: "#1b5e20",
    brandGreen: "#4caf50",
    brandOrange: "#f57c00",
    brandRed: "#d32f2f",
    brandCream: "#f5f5f0",
    brandGreenTint: "#e8f5e9",
    brandOrangeTint: "#fff3e0",
    brandRedTint: "#ffebee",
  },
  config: {
    localityName: "Milton Keynes",
    senderName: "Aheed Food Centre",
    senderEmail: "orders@aheedfoodcentre.nocaped.com",
    searchPlaceholder: "Search halal lamb, basmati, lentils…",
    // P7.5c+f (#239) — copy that used to be hardcoded in Header.tsx and the
    // homepage hero, and so rendered for SriMart too. Aheed's halal claim is
    // legitimate vendor data; it just had to stop being a platform constant.
    bannerNote: "100% Certified HMC Halal Fresh Meat Cut Daily",
    heroSubtitle:
      "Delivering fresh groceries straight to your door with our own dedicated delivery team.",
    deliveryFeePence: 349,
    freeDeliveryThresholdPence: 3000,
    minimumOrderPence: 1500,
    loyaltyEnabled: true,
    pointsPerPoundEarned: 1,
    pencePerPointRedeemed: 1, // 100 points = £1, matching the mockup's copy
    minRedeemPoints: 100,
    tierWindowDays: 30,
    pointsExpiryMonths: 12,
  },
  deliveryPrefixes: ["MK"],
  loyaltyTiers: [
    { key: "SILVER", name: "Silver", thresholdPence: 5000, multiplierBps: 12500, sortOrder: 1 },
    { key: "GOLD", name: "Gold", thresholdPence: 10000, multiplierBps: 15000, sortOrder: 2 },
  ],
  discountCodes: [
    {
      code: "WELCOME10",
      description: "10% off your first order over £15",
      kind: "PERCENTAGE",
      // Basis points: 1000 = 10%. Same unit as VendorLoyaltyTier.multiplierBps.
      value: 1000,
      minSubtotalPence: 1500,
      remainingRedemptions: null,
      // Capped per customer, which also means the code requires sign-in — a
      // guest has no identity to count uses against.
      maxPerCustomer: 1,
    },
  ],
};

type CatalogueProduct = {
  slug: string;
  name: string;
  description: string;
  basePrice: number;
  unitLabel: string;
  quantity: number;
  origin?: string;
  originalPrice?: number;
  isHalal?: boolean;
  isFresh?: boolean;
  isOrganic?: boolean;
};

type CatalogueCategory = {
  category: { slug: string; name: string };
  products: CatalogueProduct[];
};

// P2a — placeholder catalogue data (specs/2026-08-07-p2a-catalogue-browsing/). Real
// Aheed product data/photography doesn't exist yet; this proves the browsing path
// (and the real storage round-trip for images) end-to-end until it does.
const CATALOGUE: CatalogueCategory[] = [
  {
    category: { slug: "fruit-veg", name: "Fruit & Veg" },
    products: [
      {
        slug: "apples",
        name: "Apples",
        description: "Crisp, everyday eating apples.",
        basePrice: 150,
        unitLabel: "£1.50 / kg",
        quantity: 40,
      },
      {
        slug: "bananas",
        name: "Bananas",
        description: "Ripe and ready to eat.",
        basePrice: 89,
        unitLabel: "£0.89 / kg",
        quantity: 60,
      },
    ],
  },
  {
    category: { slug: "bakery", name: "Bakery" },
    products: [
      {
        slug: "sourdough-loaf",
        name: "Sourdough Loaf",
        description: "Freshly baked sourdough.",
        basePrice: 320,
        unitLabel: "£3.20 each",
        quantity: 15,
      },
      {
        slug: "croissants",
        name: "Croissants",
        description: "Buttery, flaky croissants, pack of 4.",
        basePrice: 240,
        unitLabel: "£2.40 / pack",
        quantity: 0,
      },
    ],
  },
  {
    category: { slug: "dairy-eggs", name: "Dairy & Eggs" },
    products: [
      {
        slug: "whole-milk",
        name: "Whole Milk",
        description: "Fresh whole milk, 2 pints.",
        basePrice: 145,
        unitLabel: "£1.45 / 2pt",
        quantity: 30,
      },
      {
        slug: "free-range-eggs",
        name: "Free Range Eggs",
        description: "Free range eggs, box of 6.",
        basePrice: 210,
        unitLabel: "£2.10 / box",
        quantity: 25,
      },
    ],
  },
  // P2.5b1 — visual redesign foundation (specs/2026-08-07-p2-5b1-visual-foundation/).
  // Fills out the mockup's real department list; existing 3 categories above are
  // left untouched (already live in production).
  {
    category: { slug: "halal-meat", name: "Halal Meat" },
    products: [
      {
        slug: "halal-chicken-breast",
        name: "Halal Chicken Breast",
        description: "Fresh halal-certified chicken breast fillets.",
        basePrice: 599,
        unitLabel: "£5.99 / kg",
        quantity: 20,
        origin: "United Kingdom",
        isHalal: true,
        isFresh: true,
      },
      {
        slug: "halal-lamb-mince",
        name: "Halal Lamb Mince",
        description: "Halal-certified lamb mince, freshly ground.",
        basePrice: 799,
        unitLabel: "£7.99 / kg",
        quantity: 15,
        origin: "United Kingdom",
        isHalal: true,
        isFresh: true,
      },
    ],
  },
  {
    category: { slug: "groceries", name: "Groceries" },
    products: [
      {
        slug: "basmati-rice-5kg",
        name: "Basmati Rice 5kg",
        description: "Long-grain aromatic basmati rice.",
        basePrice: 899,
        unitLabel: "£8.99 / 5kg",
        quantity: 35,
        origin: "India",
      },
      {
        slug: "sunflower-oil-2l",
        name: "Sunflower Oil 2L",
        description: "Pure sunflower cooking oil.",
        basePrice: 449,
        unitLabel: "£4.49 / 2L",
        quantity: 40,
      },
    ],
  },
  {
    category: { slug: "international", name: "International" },
    products: [
      {
        slug: "coconut-milk",
        name: "Coconut Milk",
        description: "Rich, creamy coconut milk, 400ml tin.",
        basePrice: 129,
        unitLabel: "£1.29 / tin",
        quantity: 50,
        origin: "Thailand",
      },
      {
        slug: "harissa-paste",
        name: "Harissa Paste",
        description: "Spicy North African chilli paste.",
        basePrice: 249,
        unitLabel: "£2.49 / jar",
        quantity: 22,
        origin: "Tunisia",
      },
    ],
  },
  {
    category: { slug: "beverages", name: "Beverages" },
    products: [
      {
        slug: "orange-juice-1l",
        name: "Orange Juice 1L",
        description: "Freshly squeezed orange juice, no added sugar.",
        basePrice: 199,
        unitLabel: "£1.99 / L",
        quantity: 30,
        isFresh: true,
      },
      {
        slug: "mint-tea-box",
        name: "Mint Tea, box of 40",
        description: "Refreshing mint tea bags.",
        basePrice: 279,
        originalPrice: 349,
        unitLabel: "£2.79 / box",
        quantity: 45,
        origin: "Morocco",
      },
    ],
  },
  {
    category: { slug: "snacks", name: "Snacks" },
    products: [
      {
        slug: "mixed-nuts-500g",
        name: "Mixed Nuts 500g",
        description: "Roasted and salted mixed nuts.",
        basePrice: 399,
        unitLabel: "£3.99 / 500g",
        quantity: 28,
        isOrganic: true,
      },
      {
        slug: "date-bites",
        name: "Date Bites, pack of 6",
        description: "Natural date and nut snack bars.",
        basePrice: 299,
        originalPrice: 349,
        unitLabel: "£2.99 / pack",
        quantity: 33,
        origin: "United Arab Emirates",
        isOrganic: true,
      },
    ],
  },
  {
    category: { slug: "household", name: "Household" },
    products: [
      {
        slug: "washing-up-liquid",
        name: "Washing Up Liquid",
        description: "Concentrated washing up liquid, 500ml.",
        basePrice: 179,
        unitLabel: "£1.79 / 500ml",
        quantity: 38,
      },
      {
        slug: "kitchen-roll-4pack",
        name: "Kitchen Roll, pack of 4",
        description: "Absorbent multi-purpose kitchen roll.",
        basePrice: 329,
        unitLabel: "£3.29 / pack",
        quantity: 26,
      },
    ],
  },
];

// Re-upload the (brand-neutral) product placeholder to every catalogue product's key.
// seedCatalogue skips categories that already exist, so its own upload never refreshes
// existing products' images — this runs unconditionally so a changed placeholder asset
// actually reaches already-seeded products.
async function refreshProductImages(catalogue: CatalogueCategory[]) {
  const placeholderImage = readFileSync(
    join(import.meta.dirname, "seed-assets", "placeholder-product.svg"),
    "utf8",
  );
  const storage = getStorage();
  const products = catalogue.flatMap((c) => c.products);
  for (const product of products) {
    await storage.putObject(`products/${product.slug}/main.svg`, placeholderImage, "image/svg+xml");
  }
  console.log(`refreshed ${products.length} placeholder product image(s)`);
}

async function seedCatalogue(vendorId: string, catalogue: CatalogueCategory[]) {
  // Idempotency is PER-VENDOR now (slugs are per-vendor unique, ADR-004): only skip a
  // category already present for THIS vendor.
  const existingSlugs = new Set(
    (await prisma.category.findMany({ where: { vendorId }, select: { slug: true } })).map(
      (c) => c.slug,
    ),
  );
  const pending = catalogue.filter(({ category }) => !existingSlugs.has(category.slug));
  if (pending.length === 0) {
    console.log(
      `All ${catalogue.length} catalogue categories already exist for ${vendorId} — skipping`,
    );
    return;
  }

  const placeholderImage = readFileSync(
    join(import.meta.dirname, "seed-assets", "placeholder-product.svg"),
    "utf8",
  );
  const storage = getStorage();

  // Upload every image BEFORE writing anything to the DB, and write each category's
  // rows in one transaction — a mid-run failure (e.g. storage credentials wrong) must
  // not leave an orphaned Category with zero Products, which would otherwise poison
  // future runs' per-category idempotency check above. (Per-vendor storage-key
  // namespacing — vendors/{vendorId}/... — is ADR-004 slice 4; here slugs are distinct
  // across vendors so keys don't collide.)
  for (const { products } of pending) {
    for (const product of products) {
      const storageKey = `products/${product.slug}/main.svg`;
      await storage.putObject(storageKey, placeholderImage, "image/svg+xml");
    }
  }

  for (const { category, products } of pending) {
    await prisma.$transaction(async (tx) => {
      const createdCategory = await tx.category.create({
        data: { ...category, vendorId },
      });

      for (const product of products) {
        await tx.product.create({
          data: {
            vendorId,
            slug: product.slug,
            name: product.name,
            description: product.description,
            categoryId: createdCategory.id,
            basePrice: product.basePrice,
            unitLabel: product.unitLabel,
            origin: product.origin,
            originalPrice: product.originalPrice,
            isHalal: product.isHalal ?? false,
            isFresh: product.isFresh ?? false,
            isOrganic: product.isOrganic ?? false,
            images: {
              create: {
                storageKey: `products/${product.slug}/main.svg`,
                alt: product.name,
                isPrimary: true,
              },
            },
            inventory: {
              create: { vendorId, quantity: product.quantity },
            },
          },
        });
      }
    });
  }
  console.log(
    `seeded ${pending.length} categories, ${pending.flatMap((c) => c.products).length} products for ${vendorId}`,
  );
}

// ADR-004 slice 3b — SriMart, a real 2nd vendor with a deliberately DIFFERENT catalogue
// (distinct slugs, so image keys don't collide with Aheed's), used to prove host→tenant
// isolation. Only seeded when both SEED_*_HOST vars are set (see main()).
const SRIMART_VENDOR_ID = "5217a4a7-0000-4000-a000-000000000002";

// Deliberately distinct from Aheed — a blue/tech palette, a different locality
// (Reading / RG), no logo yet (renders a wordmark) — so the two hosts are
// visibly different vendors, proving branding is data-driven (ADR-004 slice 4).
const SRIMART_SATELLITES: VendorSatellites = {
  branding: {
    name: "SriMart",
    tagline: "Everyday tech & home essentials — delivered across Reading",
    logoStorageKey: null,
    brandGreenDark: "#0d47a1", // maps to --color-primary
    brandGreen: "#1e88e5", // --color-action
    brandOrange: "#8e24aa", // --color-accent
    brandRed: "#c62828", // --color-danger
    brandCream: "#eef2f8", // --color-surface-muted
    brandGreenTint: "#e3f2fd",
    brandOrangeTint: "#f3e5f5",
    brandRedTint: "#ffebee",
  },
  config: {
    localityName: "Reading",
    senderName: "SriMart",
    senderEmail: "orders@srimart.nocaped.com",
    searchPlaceholder: "Search chargers, earbuds, lamps…",
    // P7.5c+f (#239) — SriMart's own voice. Before this slice it advertised
    // "100% Certified HMC Halal Fresh Meat Cut Daily" and "Delivering fresh
    // groceries…", because both were literals in shared components. Nothing
    // here names a trade belonging to Aheed, which is what R17 checks.
    bannerNote: "12-month warranty on every device",
    heroSubtitle: "Everyday tech and home essentials, delivered across Reading by our own team.",
    deliveryFeePence: 299,
    freeDeliveryThresholdPence: 5000,
    minimumOrderPence: 1000,
    // Deliberately OFF — the second vendor is what proves loyalty is per-vendor
    // data rather than a platform-wide constant.
    loyaltyEnabled: false,
    pointsPerPoundEarned: 1,
    pencePerPointRedeemed: 1,
    minRedeemPoints: 100,
    tierWindowDays: 30,
    pointsExpiryMonths: null,
  },
  deliveryPrefixes: ["RG"],
  loyaltyTiers: [],
  // Deliberately empty: SriMart runs no discount scheme, which is what proves
  // codes are per-vendor data rather than a platform-wide list.
  discountCodes: [],
};

// P8.5c (#347) — curated bundles, addressed by PRODUCT SLUG rather than id so
// the fixture is readable and stays valid across a `migrate reset` (ids are
// generated, slugs are authored). A bundle names products that must already
// belong to the same vendor; seedBundles resolves and refuses otherwise.
//
// SriMart gets one too, deliberately (R5). `prisma/seed.ts` warns rather than
// silently skipping SriMart (#276), and a bundle-less second vendor is exactly
// what makes a per-vendor rendering bug invisible.
interface BundleFixture {
  slug: string;
  name: string;
  tagline: string;
  sortOrder: number;
  items: { productSlug: string; quantity: number }[];
}

const AHEED_BUNDLES: BundleFixture[] = [
  {
    slug: "weekly-halal-meat-box",
    name: "Weekly Halal Meat Box",
    tagline: "Chicken breast, lamb mince and rice — the week's cooking, sorted.",
    sortOrder: 0,
    items: [
      { productSlug: "halal-chicken-breast", quantity: 2 },
      { productSlug: "halal-lamb-mince", quantity: 1 },
      { productSlug: "basmati-rice-5kg", quantity: 1 },
    ],
  },
  {
    slug: "breakfast-basics",
    name: "Breakfast Basics",
    tagline: "Bread, milk and eggs — the three things that run out first.",
    sortOrder: 1,
    items: [
      { productSlug: "sourdough-loaf", quantity: 1 },
      { productSlug: "whole-milk", quantity: 2 },
      { productSlug: "free-range-eggs", quantity: 1 },
    ],
  },
  {
    slug: "store-cupboard-starter",
    name: "Store Cupboard Starter",
    tagline: "Rice, oil and coconut milk to build a week of meals on.",
    sortOrder: 2,
    items: [
      { productSlug: "basmati-rice-5kg", quantity: 1 },
      { productSlug: "sunflower-oil-2l", quantity: 1 },
      { productSlug: "coconut-milk", quantity: 3 },
    ],
  },
];

const SRIMART_BUNDLES: BundleFixture[] = [
  {
    slug: "sri-desk-setup",
    name: "Desk Setup Bundle",
    tagline: "Lamp, charger and earbuds for a working-from-home desk.",
    sortOrder: 0,
    items: [
      { productSlug: "sri-desk-lamp", quantity: 1 },
      { productSlug: "sri-phone-charger", quantity: 1 },
      { productSlug: "sri-earbuds", quantity: 1 },
    ],
  },
];

/**
 * Idempotent per vendor: a bundle already present for THIS vendor (by slug) is
 * left alone, matching seedCatalogue's per-vendor posture. Re-running the seed
 * therefore neither duplicates bundles nor overwrites a curation an admin has
 * since edited by hand.
 */
async function seedBundles(vendorId: string, fixtures: BundleFixture[]) {
  const existing = new Set(
    (await prisma.bundle.findMany({ where: { vendorId }, select: { slug: true } })).map(
      (b) => b.slug,
    ),
  );
  const pending = fixtures.filter((fixture) => !existing.has(fixture.slug));
  if (pending.length === 0) {
    console.log(`All ${fixtures.length} bundles already exist for ${vendorId} — skipping`);
    return;
  }

  const slugs = [...new Set(pending.flatMap((f) => f.items.map((i) => i.productSlug)))];
  const products = await prisma.product.findMany({
    where: { vendorId, slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(products.map((p) => [p.slug, p.id]));

  for (const fixture of pending) {
    const missing = fixture.items.filter((item) => !idBySlug.has(item.productSlug));
    if (missing.length > 0) {
      // Loud, not silent — the #276 lesson. A bundle quietly seeded without its
      // products would render as an empty card and look like a rendering bug.
      console.log(
        `WARNING: skipping bundle "${fixture.slug}" for ${vendorId} — no such product(s): ` +
          missing.map((item) => item.productSlug).join(", "),
      );
      continue;
    }

    await prisma.bundle.create({
      data: {
        vendorId,
        slug: fixture.slug,
        name: fixture.name,
        tagline: fixture.tagline,
        sortOrder: fixture.sortOrder,
        items: {
          create: fixture.items.map((item, index) => ({
            productId: idBySlug.get(item.productSlug)!,
            quantity: item.quantity,
            sortOrder: index,
          })),
        },
      },
    });
  }

  console.log(`seeded ${pending.length} bundles for ${vendorId}`);
}

const SRIMART_CATALOGUE: CatalogueCategory[] = [
  {
    category: { slug: "sri-electronics", name: "Electronics" },
    products: [
      {
        slug: "sri-phone-charger",
        name: "Fast Phone Charger",
        description: "20W USB-C fast charger.",
        basePrice: 1299,
        unitLabel: "£12.99 each",
        quantity: 25,
      },
      {
        slug: "sri-earbuds",
        name: "Wireless Earbuds",
        description: "Bluetooth earbuds with charging case.",
        basePrice: 2499,
        unitLabel: "£24.99 / pair",
        quantity: 15,
      },
    ],
  },
  {
    category: { slug: "sri-home", name: "Home & Living" },
    products: [
      {
        slug: "sri-desk-lamp",
        name: "LED Desk Lamp",
        description: "Dimmable LED desk lamp with USB port.",
        basePrice: 1899,
        unitLabel: "£18.99 each",
        quantity: 20,
      },
    ],
  },
];

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
