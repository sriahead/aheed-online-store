import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { getStorage } from "@/lib/storage";
import { GENERATED_SLUG_PREFIX, generateProducts } from "./generate-catalogue";

// Seed runs in Node (locally or CI) — prefers DIRECT_URL.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DIRECT_URL/DATABASE_URL is empty in the seed process — check .env is present and loading.",
  );
}
console.log("seed connecting to:", connectionString.replace(/:[^:@/]+@/, ":****@")); // mask password

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

/**
 * #489 R13 — the HOST only, never the connection string. The masked log line above still carries
 * user, host, database and query params; this is the one line an operator is asked to eyeball
 * before ~2,000 rows are written, so it prints exactly the fact being checked and nothing else.
 * `CLAUDE.md` records why: a grep for `BASE_URL` once printed a Neon password in full (#175).
 */
function resolvedDbHost(): string {
  try {
    return new URL(connectionString as string).host;
  } catch {
    return "(unparseable connection string)";
  }
}

/**
 * #489 R9 — every storage write goes through here so the seed can report how many objects it
 * actually uploaded. The generated catalogue shares one key per subcategory rather than writing
 * one object per product; without a counter that claim is unfalsifiable from the outside.
 */
let putObjectCount = 0;
async function putTracked(key: string, body: string, contentType: string): Promise<void> {
  await getStorage().putObject(key, body, contentType);
  putObjectCount += 1;
}

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
  await seedSubcategories(AHEED_VENDOR_ID, CATALOGUE);
  await seedSubcategoryProducts(AHEED_VENDOR_ID, AHEED_SUBCATEGORY_PRODUCTS);
  await seedFeaturedProducts(AHEED_VENDOR_ID, AHEED_FEATURED_SLUGS);
  await refreshProductImages(CATALOGUE);
  await upsertVendorSatellites(AHEED_VENDOR_ID, AHEED_SATELLITES);
  // After the catalogue: bundles resolve their constituents by product slug.
  await seedBundles(AHEED_VENDOR_ID, AHEED_BUNDLES);
  await seedPriceTiers(AHEED_VENDOR_ID, AHEED_PRICE_TIERS);
  await seedSearchSynonyms(AHEED_VENDOR_ID);

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
    await seedSubcategories(SRIMART_VENDOR_ID, SRIMART_CATALOGUE);
    await seedSubcategoryProducts(SRIMART_VENDOR_ID, SRIMART_SUBCATEGORY_PRODUCTS);
    await seedFeaturedProducts(SRIMART_VENDOR_ID, SRIMART_FEATURED_SLUGS);
    await refreshProductImages(SRIMART_CATALOGUE);
    await upsertVendorSatellites(SRIMART_VENDOR_ID, SRIMART_SATELLITES);
    await seedBundles(SRIMART_VENDOR_ID, SRIMART_BUNDLES);
    await seedPriceTiers(SRIMART_VENDOR_ID, SRIMART_PRICE_TIERS);
    await seedSearchSynonyms(SRIMART_VENDOR_ID);
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

  // #489 — the generated catalogue, LAST, and Aheed-only.
  //
  // Aheed-only is deliberate: SriMart exists to prove host-to-tenant isolation, and keeping it
  // small means a slow query measured against Aheed is provably about row count rather than about
  // multi-tenancy. Last, because bundles and price tiers above resolve products by slug and have
  // no business matching a generated row.
  //
  // Removal takes precedence over generation so a single command can undo a scale run without
  // needing the count that produced it.
  if (process.env.SEED_REMOVE_GENERATED?.trim()) {
    await removeGeneratedCatalogue(AHEED_VENDOR_ID);
    // #521 — SriMart can now hold generated rows too, so the undo has to reach both or
    // `SEED_REMOVE_GENERATED` would silently leave half the generated set behind.
    await removeGeneratedCatalogue(SRIMART_VENDOR_ID);
  } else {
    // Aheed only, deliberately. #521's first attempt also generated for SriMart and the result was
    // "Value Lentils" filed under `sri-chargers-cables`: `generate-catalogue.ts` draws from a
    // single groceries-only word pool, so it can never produce sensible rows for an electronics
    // vendor. SriMart's second tier is curated in `SRIMART_SUBCATEGORY_PRODUCTS` instead, and
    // SriMart is meant to stay small anyway (see `seedGeneratedCatalogue`'s note on why scale
    // measurement is Aheed-only).
    await maybeSeedGeneratedCatalogue("SEED_SCALE_PRODUCTS", AHEED_VENDOR_ID, CATALOGUE);
  }

  // #489 R9 — makes "the generated set shares a small image pool" checkable from the outside.
  console.log(`total putObject calls this run: ${putObjectCount}`);
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
  /** #569 — dietary facets, HMC provenance and brand, so every new filter is reachable. */
  isVegetarian?: boolean;
  isGlutenFree?: boolean;
  isHmcCertified?: boolean;
  hmcReference?: string;
  hmcVerifiedAt?: string;
  /** A brand SLUG; resolved to an id at write time. */
  brand?: string;
};

type CatalogueCategory = {
  category: { slug: string; name: string };
  products: CatalogueProduct[];
  /**
   * #489 — the second tier. `Category.parentId` has existed since P2a and
   * `lib/repositories/categories.ts`'s `checkParent` caps the tree at exactly two levels, but no
   * fixture had ever populated a single child, so every nav surface rendered one tier for want of
   * data rather than schema. Children are created in their own pass keyed on the child's slug (not
   * the parent's), so they also reach a database that was seeded before this field existed.
   */
  children?: { slug: string; name: string }[];
};

// P2a — placeholder catalogue data (specs/2026-08-07-p2a-catalogue-browsing/). Real
// Aheed product data/photography doesn't exist yet; this proves the browsing path
// (and the real storage round-trip for images) end-to-end until it does.
const CATALOGUE: CatalogueCategory[] = [
  {
    category: { slug: "fruit-veg", name: "Fruit & Veg" },
    children: [
      { slug: "fresh-fruit", name: "Fresh Fruit" },
      { slug: "fresh-vegetables", name: "Fresh Vegetables" },
      { slug: "herbs-salads", name: "Herbs & Salads" },
    ],
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
    children: [
      { slug: "bread-loaves", name: "Bread & Loaves" },
      { slug: "pastries", name: "Pastries" },
      { slug: "cakes-desserts", name: "Cakes & Desserts" },
    ],
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
    children: [
      { slug: "milk-cream", name: "Milk & Cream" },
      { slug: "cheese-paneer", name: "Cheese & Paneer" },
      { slug: "eggs-butter", name: "Eggs & Butter" },
    ],
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
    children: [
      { slug: "lamb-mutton", name: "Lamb & Mutton" },
      { slug: "chicken-poultry", name: "Chicken & Poultry" },
      { slug: "beef-mince", name: "Beef & Mince" },
    ],
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
        // #569 — the flag never travels without its provenance, in fixture data exactly as the
        // admin form enforces at write time. A demo reference, but a demo reference in the right
        // SHAPE: certification is a claim about a third party, and #239 is why it carries evidence.
        isHmcCertified: true,
        hmcReference: "HMC/DEMO/00417",
        hmcVerifiedAt: "2026-07-14",
        brand: "shan",
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
    children: [
      { slug: "rice-grains", name: "Rice & Grains" },
      { slug: "lentils-pulses", name: "Lentils & Pulses" },
      { slug: "cooking-oils", name: "Cooking Oils" },
    ],
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
    children: [
      { slug: "south-asian", name: "South Asian" },
      { slug: "middle-eastern", name: "Middle Eastern" },
      { slug: "african-caribbean", name: "African & Caribbean" },
    ],
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
    children: [
      { slug: "tea-coffee", name: "Tea & Coffee" },
      { slug: "juices-soft-drinks", name: "Juices & Soft Drinks" },
      { slug: "water-mixers", name: "Water & Mixers" },
    ],
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
        isVegetarian: true,
        brand: "trs",
      },
    ],
  },
  {
    category: { slug: "snacks", name: "Snacks" },
    children: [
      { slug: "crisps-namkeen", name: "Crisps & Namkeen" },
      { slug: "biscuits-sweets", name: "Biscuits & Sweets" },
      { slug: "nuts-dried-fruit", name: "Nuts & Dried Fruit" },
    ],
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
        isVegetarian: true,
        isGlutenFree: true,
        brand: "east-end",
      },
    ],
  },
  {
    category: { slug: "household", name: "Household" },
    children: [
      { slug: "cleaning", name: "Cleaning" },
      { slug: "kitchen-foil", name: "Kitchen & Foil" },
      { slug: "paper-toiletries", name: "Paper & Toiletries" },
    ],
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
  // #496 — four more departments so the top scroller has enough rows to
  // actually need scrolling on a typical viewport, not just the original
  // nine (which nearly fill a 1280px screen on their own). No `children`:
  // these aren't part of #489's generated-catalogue scale test, only real,
  // small, curated departments like the original nine were before it.
  {
    category: { slug: "frozen-foods", name: "Frozen Foods" },
    products: [
      {
        slug: "frozen-peas-1kg",
        name: "Frozen Peas 1kg",
        description: "Garden peas, frozen at the peak of freshness.",
        basePrice: 149,
        unitLabel: "£1.49 / kg",
        quantity: 40,
      },
      {
        slug: "frozen-chicken-nuggets",
        name: "Chicken Nuggets 500g",
        description: "Halal-certified breaded chicken nuggets.",
        basePrice: 349,
        unitLabel: "£6.98 / kg",
        quantity: 22,
        isHalal: true,
      },
    ],
  },
  {
    category: { slug: "health-beauty", name: "Health & Beauty" },
    products: [
      {
        slug: "shampoo-400ml",
        name: "Shampoo 400ml",
        description: "Everyday shampoo for all hair types.",
        basePrice: 299,
        unitLabel: "£7.48 / litre",
        quantity: 30,
      },
      {
        slug: "toothpaste-100ml",
        name: "Toothpaste 100ml",
        description: "Fluoride toothpaste, mint flavour.",
        basePrice: 179,
        unitLabel: "£1.79 / 100ml",
        quantity: 45,
      },
    ],
  },
  {
    category: { slug: "baby-kids", name: "Baby & Kids" },
    products: [
      {
        slug: "baby-wipes-80pk",
        name: "Baby Wipes, pack of 80",
        description: "Fragrance-free, gentle on newborn skin.",
        basePrice: 199,
        unitLabel: "£1.99 / pack",
        quantity: 36,
      },
      {
        slug: "infant-formula-900g",
        name: "Infant Formula 900g",
        description: "Stage 1 infant formula milk powder.",
        basePrice: 1499,
        unitLabel: "£16.66 / kg",
        quantity: 15,
      },
    ],
  },
  {
    category: { slug: "pet-supplies", name: "Pet Supplies" },
    products: [
      {
        slug: "dog-food-2kg",
        name: "Dog Food 2kg",
        description: "Complete dry dog food, chicken flavour.",
        basePrice: 599,
        unitLabel: "£2.99 / kg",
        quantity: 20,
      },
      {
        slug: "cat-litter-5kg",
        name: "Cat Litter 5kg",
        description: "Clumping cat litter, low dust.",
        basePrice: 449,
        unitLabel: "£0.90 / kg",
        quantity: 18,
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
  // #489 R9 — deliberately iterates only the CURATED fixture products. The generated set is not
  // reachable from `catalogue` and must never be refreshed per-product: it shares one key per
  // subcategory, so refreshing it means re-uploading that small pool, not 2,000 objects.
  const products = catalogue.flatMap((c) => c.products);
  for (const product of products) {
    await putTracked(`products/${product.slug}/main.svg`, placeholderImage, "image/svg+xml");
  }
  console.log(`refreshed ${products.length} placeholder product image(s)`);
}

/**
 * #569 — the brands the fixture catalogue references.
 *
 * Seeded with `upsert` and OUTSIDE the per-category idempotency check below, deliberately. That
 * check returns early once a vendor's categories exist, so anything placed after it never runs
 * again for an already-seeded database — which is exactly how #502's product images ended up
 * present in dev and absent in staging. Brands must be able to appear in a database seeded before
 * this slice existed.
 */
const CATALOGUE_BRANDS: { slug: string; name: string }[] = [
  { slug: "shan", name: "Shan" },
  { slug: "east-end", name: "East End" },
  { slug: "trs", name: "TRS" },
];

async function seedBrands(vendorId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const brand of CATALOGUE_BRANDS) {
    const row = await prisma.brand.upsert({
      where: { vendorId_slug: { vendorId, slug: brand.slug } },
      create: { vendorId, slug: brand.slug, name: brand.name },
      update: { name: brand.name },
      select: { id: true },
    });
    ids.set(brand.slug, row.id);
  }
  console.log(`seeded ${CATALOGUE_BRANDS.length} brands for ${vendorId}`);
  return ids;
}

/**
 * #569 — apply the fixture's facet fields to products that ALREADY EXIST.
 *
 * WHY THIS IS SEPARATE FROM THE CREATE PATH, and why it runs before the early return below.
 * `seedCatalogue` skips any category already present for the vendor, so everything after that check
 * only ever runs against a from-scratch database. New columns added to the fixture would therefore
 * reach a fresh dev database and NEVER reach an already-seeded one — dev, staging and production
 * would each show a different set of facets, and a filter with no qualifying row simply does not
 * render, so the gap looks like "this vendor has no vegetarian stock" rather than like a bug.
 *
 * That is precisely #502: a row-only idempotency guard placed above the work it guards, leaving two
 * environments silently divergent. Here the cost of getting it wrong is a facet that can never be
 * validated anywhere except a database nobody has.
 *
 * Idempotent and narrow: it writes only the columns this slice added, only for fixture products
 * that actually declare them, and only where the product already exists.
 */
async function applyFacetFields(
  vendorId: string,
  catalogue: CatalogueCategory[],
  brandIds: Map<string, string>,
) {
  let updated = 0;
  for (const product of catalogue.flatMap((c) => c.products)) {
    const brandId = product.brand ? (brandIds.get(product.brand) ?? null) : null;
    const hasFacetData =
      product.isVegetarian !== undefined ||
      product.isGlutenFree !== undefined ||
      product.isHmcCertified !== undefined ||
      brandId !== null;
    if (!hasFacetData) continue;

    const existing = await prisma.product.findFirst({
      where: { vendorId, slug: product.slug },
      select: { id: true },
    });
    if (!existing) continue;

    await prisma.product.update({
      where: { id: existing.id },
      data: {
        isVegetarian: product.isVegetarian ?? false,
        isGlutenFree: product.isGlutenFree ?? false,
        isHmcCertified: product.isHmcCertified ?? false,
        hmcReference: product.hmcReference ?? null,
        hmcVerifiedAt: product.hmcVerifiedAt
          ? new Date(`${product.hmcVerifiedAt}T00:00:00.000Z`)
          : null,
        brandId,
      },
    });
    updated += 1;
  }
  if (updated > 0) console.log(`applied #569 facet fields to ${updated} existing product(s)`);
}

async function seedCatalogue(vendorId: string, catalogue: CatalogueCategory[]) {
  // #569 — both before the early return below, so brands and facet fields reach a database that was
  // seeded before this slice existed. See applyFacetFields for why that positioning matters.
  const brandIds = await seedBrands(vendorId);
  await applyFacetFields(vendorId, catalogue, brandIds);

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

  // Upload every image BEFORE writing anything to the DB, and write each category's
  // rows in one transaction — a mid-run failure (e.g. storage credentials wrong) must
  // not leave an orphaned Category with zero Products, which would otherwise poison
  // future runs' per-category idempotency check above. (Per-vendor storage-key
  // namespacing — vendors/{vendorId}/... — is ADR-004 slice 4; here slugs are distinct
  // across vendors so keys don't collide.)
  for (const { products } of pending) {
    for (const product of products) {
      await putTracked(`products/${product.slug}/main.svg`, placeholderImage, "image/svg+xml");
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
            isVegetarian: product.isVegetarian ?? false,
            isGlutenFree: product.isGlutenFree ?? false,
            // The HMC invariant lib/catalogue-form.ts enforces holds in fixture data too: the flag
            // is never true without both provenance fields behind it (#569, R43).
            isHmcCertified: product.isHmcCertified ?? false,
            hmcReference: product.hmcReference ?? null,
            hmcVerifiedAt: product.hmcVerifiedAt
              ? new Date(`${product.hmcVerifiedAt}T00:00:00.000Z`)
              : null,
            brandId: product.brand ? (brandIds.get(product.brand) ?? null) : null,
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

/**
 * #489 — create the second category tier.
 *
 * Its own pass, called separately from `seedCatalogue`, for two reasons. First, `seedCatalogue`
 * returns early when every top-level category already exists, so folding children into it would
 * mean a database seeded before this slice never gains them. Second, idempotency here is keyed on
 * the CHILD's slug, not the parent's — the two questions ("does this department exist?" and "does
 * this subcategory exist?") have different answers and need different checks.
 *
 * Depth is not enforced here because it does not need to be: every child names a parent drawn from
 * the same fixture's top-level entries, which have `parentId: null` by construction. That keeps the
 * seed consistent with `lib/repositories/categories.ts`'s `checkParent`, which caps the admin path
 * at two levels.
 */
async function seedSubcategories(vendorId: string, catalogue: CatalogueCategory[]) {
  const withChildren = catalogue.filter((c) => (c.children?.length ?? 0) > 0);
  if (withChildren.length === 0) return;

  const existing = new Set(
    (await prisma.category.findMany({ where: { vendorId }, select: { slug: true } })).map(
      (c) => c.slug,
    ),
  );

  let created = 0;
  for (const { category, children } of withChildren) {
    const parent = await prisma.category.findFirst({
      where: { vendorId, slug: category.slug },
      select: { id: true },
    });
    // A parent can legitimately be absent (SriMart is only seeded when both host vars are set).
    if (!parent) continue;

    const missing = (children ?? []).filter((child) => !existing.has(child.slug));
    if (missing.length === 0) continue;

    await prisma.category.createMany({
      data: missing.map((child, index) => ({
        vendorId,
        slug: child.slug,
        name: child.name,
        parentId: parent.id,
        sortOrder: index,
      })),
    });
    created += missing.length;
  }

  console.log(
    created === 0
      ? `all subcategories already exist for ${vendorId} — skipping`
      : `seeded ${created} subcategories for ${vendorId}`,
  );
}

/**
 * #501 — mark a few curated products as featured.
 *
 * `Product.isFeatured` is `@default(false)` and NOTHING in this seed had ever set it, so no
 * product in any seeded environment was featured. `app/(storefront)/categories/page.tsx` asks for
 * `list({ take: 4, isFeatured: true })` and `ProductRow` returns `null` on an empty list, which
 * means the Featured Products row was absent from the shop page entirely — and the "View all"
 * this slice points at `/search?featured=1` would have led to an empty listing. The row was never
 * broken code; it was a row with no data behind it, the same class of gap #496 closed by adding
 * real departments.
 *
 * ITS OWN PASS, called separately from `seedCatalogue`, for the reason `seedSubcategories`
 * documents directly above: `seedCatalogue` returns early per category once it exists, so a
 * database seeded before this slice would never gain the flag. An `updateMany` keyed on slug is
 * idempotent and reaches those databases. (`updateMany` is safe here — this script runs in real
 * Node on the WebSocket adapter, not the HTTP one that cannot execute the query compiler's
 * internal transaction; see CLAUDE.md's #382 note.)
 *
 * DELIBERATELY FEWER THAN THE 12-ITEM `/search` PAGE SIZE, so a featured listing is visibly a
 * strict subset of the catalogue rather than a full page that would prove nothing about whether
 * the filter is applied at all.
 */
const AHEED_FEATURED_SLUGS = [
  "halal-chicken-breast",
  "basmati-rice-5kg",
  "sourdough-loaf",
  "free-range-eggs",
  "mixed-nuts-500g",
  "coconut-milk",
];

const SRIMART_FEATURED_SLUGS = ["sri-earbuds", "sri-desk-lamp"];

async function seedFeaturedProducts(vendorId: string, slugs: string[]) {
  if (slugs.length === 0) return;

  const { count } = await prisma.product.updateMany({
    where: { vendorId, slug: { in: slugs } },
    data: { isFeatured: true },
  });

  console.log(
    count === 0
      ? `no products matched the featured slugs for ${vendorId} — none marked featured`
      : `marked ${count} products featured for ${vendorId}`,
  );
}

/** Rows per `createMany` statement. 2,000 in one statement is a needlessly large single query;
 *  500 keeps each round-trip modest while still being ~4 statements instead of ~2,000 inserts. */
const GENERATED_BATCH = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * #489 — the generated catalogue, for scale testing only.
 *
 * Three deliberate departures from `seedCatalogue`, each answering a specific way that function
 * fails to survive 2,000 rows:
 *
 * 1. ONE IMAGE OBJECT PER SUBCATEGORY, not per product. `seedCatalogue` uploads the same
 *    placeholder bytes once per product; at 2,000 that is 2,000 identical uploads on every run.
 *    Keys stay relative and immutable per CLAUDE.md — nothing ever required a 1:1 product-to-object
 *    mapping, and sharing one key across a category's products is invisible to every read path.
 * 2. `createMany`, not a per-product `create`. This is safe HERE and specifically not safe in the
 *    Worker: the seed runs in real Node on the WebSocket adapter (`PrismaNeon`), whereas #382
 *    records that `createMany`/`updateMany` crash unconditionally through `getPrisma()`'s HTTP
 *    adapter with "Transactions are not supported in HTTP mode".
 * 3. ITS OWN IDEMPOTENCY CHECK, keyed on the generated slug prefix. `seedCatalogue`'s check is
 *    keyed on category slug, so generated products hung under an existing category would be
 *    skipped wholesale on a re-run.
 */
/**
 * #521 — read one vendor's generated-catalogue count from its own env var and seed it.
 *
 * `seedGeneratedCatalogue` was already vendor-generic; only its CALL SITE was
 * Aheed-only, which is why every SriMart subcategory in every environment was
 * empty. A separate var per vendor rather than one shared count: the two
 * catalogues have very different sizes (13 subcategories vs 2), and #489's
 * recorded NFR measurement is defined by the Aheed number specifically, so
 * making one value drive both would silently change what that measurement
 * means.
 *
 * Unset is the default and seeds nothing, so no existing environment changes
 * behaviour by this function existing.
 */
async function maybeSeedGeneratedCatalogue(
  envVar: string,
  vendorId: string,
  catalogue: CatalogueCategory[],
) {
  const raw = process.env[envVar]?.trim();
  if (!raw) return;
  const requested = Number.parseInt(raw, 10);
  if (!Number.isFinite(requested) || requested < 0) {
    throw new Error(`${envVar} must be a non-negative integer — got "${raw}"`);
  }
  await seedGeneratedCatalogue(vendorId, catalogue, requested);
}

async function seedGeneratedCatalogue(
  vendorId: string,
  catalogue: CatalogueCategory[],
  count: number,
) {
  if (count <= 0) return;

  const childSlugs = catalogue.flatMap((c) => (c.children ?? []).map((child) => child.slug));
  if (childSlugs.length === 0) {
    throw new Error(
      "seedGeneratedCatalogue: no subcategories in the fixture — run seedSubcategories first",
    );
  }

  const categories = await prisma.category.findMany({
    where: { vendorId, slug: { in: childSlugs } },
    select: { id: true, slug: true },
  });
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const usableSlugs = childSlugs.filter((slug) => categoryIdBySlug.has(slug));
  if (usableSlugs.length === 0) {
    throw new Error(
      "seedGeneratedCatalogue: no subcategories found in the database for this vendor",
    );
  }

  /*
   * One shared object per subcategory (R8) — uploaded before any DB write, matching
   * seedCatalogue's ordering rationale.
   *
   * #502: THIS RUNS BEFORE THE `existing >= count` GUARD BELOW, AND MUST STAY THERE.
   * It used to sit after it, so the moment a database held the generated rows, no later
   * seed run uploaded these objects into that environment's bucket. Rows and objects are
   * written by this one function but the guard only ever consulted the rows, so the two
   * diverged silently per environment: every `products/gen-<subcategory>/main.svg` key existed in the
   * dev bucket and 404ed in staging's, while staging's pages went on referencing them.
   * The uploads are idempotent (same key, same bytes), so running them on a re-run costs
   * one PUT per subcategory and closes that gap.
   */
  const placeholderImage = readFileSync(
    join(import.meta.dirname, "seed-assets", "placeholder-product.svg"),
    "utf8",
  );
  const storageKeyBySlug = new Map<string, string>();
  for (const slug of usableSlugs) {
    const key = `products/${GENERATED_SLUG_PREFIX}${slug}/main.svg`;
    await putTracked(key, placeholderImage, "image/svg+xml");
    storageKeyBySlug.set(slug, key);
  }
  console.log(`refreshed ${storageKeyBySlug.size} generated placeholder image(s)`);

  const existing = await prisma.product.count({
    where: { vendorId, slug: { startsWith: GENERATED_SLUG_PREFIX } },
  });
  if (existing >= count) {
    console.log(
      `generated catalogue already holds ${existing} product(s) for ${vendorId} (>= ${count}) — skipping row creation`,
    );
    return;
  }

  // R13 — the operator's last chance to notice this is pointed at the wrong database, printed
  // immediately before the first write rather than buried at process start.
  console.log(
    `\n>>> generating ${count} products for vendor ${vendorId} in database host: ${resolvedDbHost()}\n`,
  );

  const generated = generateProducts(count, usableSlugs);

  // Ids are generated up front so images and inventory can be written with their own
  // `createMany` rather than as nested creates, which `createMany` cannot express.
  const rows = generated.map((product) => ({ id: randomUUID(), product }));

  for (const batch of chunk(rows, GENERATED_BATCH)) {
    await prisma.product.createMany({
      data: batch.map(({ id, product }) => ({
        id,
        vendorId,
        slug: product.slug,
        name: product.name,
        description: product.description,
        categoryId: categoryIdBySlug.get(product.categorySlug) as string,
        basePrice: product.basePrice,
        unitLabel: product.unitLabel,
        origin: product.origin,
        isHalal: product.isHalal,
        isFresh: product.isFresh,
        isOrganic: product.isOrganic,
      })),
    });
  }

  for (const batch of chunk(rows, GENERATED_BATCH)) {
    await prisma.productImage.createMany({
      data: batch.map(({ id, product }) => ({
        productId: id,
        storageKey: storageKeyBySlug.get(product.categorySlug) as string,
        alt: product.name,
        isPrimary: true,
      })),
    });
  }

  for (const batch of chunk(rows, GENERATED_BATCH)) {
    await prisma.inventory.createMany({
      data: batch.map(({ id, product }) => ({
        vendorId,
        productId: id,
        quantity: product.quantity,
      })),
    });
  }

  console.log(
    `seeded ${generated.length} generated products across ${usableSlugs.length} subcategories for ${vendorId}`,
  );
}

/**
 * #489 R7 — remove exactly the generated set, leaving every curated product and every category
 * intact. Children first: `ProductImage` and `Inventory` reference `Product` with the default
 * restrictive FK behaviour, so deleting products first would fail.
 */
async function removeGeneratedCatalogue(vendorId: string) {
  const doomed = await prisma.product.findMany({
    where: { vendorId, slug: { startsWith: GENERATED_SLUG_PREFIX } },
    select: { id: true },
  });
  if (doomed.length === 0) {
    console.log(`no generated products to remove for ${vendorId}`);
    return;
  }
  const ids = doomed.map((p) => p.id);

  console.log(
    `\n>>> removing ${ids.length} generated products for vendor ${vendorId} in database host: ${resolvedDbHost()}\n`,
  );

  for (const batch of chunk(ids, GENERATED_BATCH)) {
    await prisma.productImage.deleteMany({ where: { productId: { in: batch } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: batch } } });
    await prisma.product.deleteMany({ where: { id: { in: batch } } });
  }

  console.log(`removed ${ids.length} generated products for ${vendorId}`);
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

/** A product's multi-buy tier (P8.5d, #348), resolved by product slug. */
interface PriceTierFixture {
  productSlug: string;
  groupQuantity: number;
  groupPricePence: number;
}

/**
 * Multi-buy tiers for BOTH vendors — SriMart included, deliberately.
 *
 * A one-vendor seed is exactly the gap #276 exists for: cross-tenant pricing
 * bugs are invisible when only one tenant has any data to price. The two
 * fixtures also differ on purpose — Aheed's group price divides evenly by its
 * group quantity and SriMart's does not (3500 / 3), so a live check exercises
 * both the tidy case and the one where a per-unit price could not have been
 * exact.
 */
/**
 * The starting search dictionary (P2.6 slice 3, #566) — the keyword set from the issue.
 *
 * Seeded APPROVED, because these are not guesses: they are the words this shop's customers use.
 * The dictionary is meant to grow from real traffic (#565's query log feeding the staff-approved AI
 * proposals), and a feature that starts from a blank page and someone's imagination is the usual
 * way a curated table dies — so it ships useful on day one.
 *
 * Idempotent by ALIAS, not by row count. A count check would stop re-runs from repairing a
 * partially-seeded dictionary, and #502's lesson is that an idempotency guard placed to skip work
 * wholesale is how two things that should agree silently diverge per environment.
 */
async function seedSearchSynonyms(vendorId: string) {
  // alias -> the word this catalogue actually uses. Several aliases may share a canonical term
  // (keema/qeema, atta mapping alongside other flour words); one alias may not have two canonicals,
  // which is what @@unique([vendorId, alias]) enforces and what bounds the expanded query.
  const pairs: [string, string][] = [
    ["bhindi", "okra"],
    ["karela", "bitter gourd"],
    ["haldi", "turmeric"],
    ["keema", "minced meat"],
    ["qeema", "minced meat"],
    ["atta", "chapati flour"],
    ["dhania", "coriander"],
    ["jeera", "cumin"],
    ["mirch", "chilli"],
    ["chana", "chickpeas"],
    ["aloo", "potato"],
    ["baingan", "aubergine"],
    ["methi", "fenugreek"],
  ];

  let created = 0;
  for (const [alias, canonical] of pairs) {
    const existing = await prisma.searchSynonym.findFirst({
      where: { vendorId, alias },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.searchSynonym.create({
      data: { vendorId, alias, canonical, status: "APPROVED", source: "SEED" },
    });
    created += 1;
  }

  console.log(`search synonyms for ${vendorId}: ${created} created, ${pairs.length} total`);
}

async function seedPriceTiers(vendorId: string, fixtures: PriceTierFixture[]) {
  const products = await prisma.product.findMany({
    where: { vendorId, slug: { in: fixtures.map((f) => f.productSlug) } },
    select: { id: true, slug: true, basePrice: true },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  let seeded = 0;
  for (const fixture of fixtures) {
    const product = bySlug.get(fixture.productSlug);
    if (!product) {
      // Loud, not silent — the #276 lesson, same as seedBundles above.
      console.log(
        `WARNING: skipping multi-buy tier for ${vendorId} — no such product: ${fixture.productSlug}`,
      );
      continue;
    }

    // A tier that does not beat buying singly would be clamped away at runtime
    // by lib/tier-pricing.ts and render nothing — a silently inert fixture,
    // which is worse than a loud one.
    if (fixture.groupPricePence >= fixture.groupQuantity * product.basePrice) {
      console.log(
        `WARNING: skipping multi-buy tier for "${fixture.productSlug}" — ` +
          `${fixture.groupPricePence}p for ${fixture.groupQuantity} is not cheaper than ` +
          `${fixture.groupQuantity} x ${product.basePrice}p`,
      );
      continue;
    }

    const existing = await prisma.productPriceTier.findFirst({
      where: { vendorId, productId: product.id },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.productPriceTier.create({
      data: {
        vendorId,
        productId: product.id,
        groupQuantity: fixture.groupQuantity,
        groupPricePence: fixture.groupPricePence,
        isActive: true,
      },
    });
    seeded += 1;
  }

  console.log(`seeded ${seeded} multi-buy tier(s) for ${vendorId}`);
}

/** "Buy 2 x 5kg Basmati for £16.50" — the P8.5 brief's own worked example. */
const AHEED_PRICE_TIERS: PriceTierFixture[] = [
  { productSlug: "basmati-rice-5kg", groupQuantity: 2, groupPricePence: 1650 },
];

/** 3500 / 3 is not an integer — the case a per-unit tier price gets wrong. */
const SRIMART_PRICE_TIERS: PriceTierFixture[] = [
  { productSlug: "sri-phone-charger", groupQuantity: 3, groupPricePence: 3500 },
];

const SRIMART_CATALOGUE: CatalogueCategory[] = [
  {
    category: { slug: "sri-electronics", name: "Electronics" },
    children: [
      { slug: "sri-audio", name: "Audio" },
      { slug: "sri-chargers-cables", name: "Chargers & Cables" },
    ],
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
    children: [
      { slug: "sri-lighting", name: "Lighting" },
      { slug: "sri-storage", name: "Storage" },
    ],
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

/**
 * #521 — two real products for every subcategory, keyed by the subcategory's own slug.
 *
 * WHY THIS EXISTS RATHER THAN `seedGeneratedCatalogue`.
 * The first attempt at #521 filled the second tier with `generateProducts` output. That was wrong
 * twice over, and both faults are inherent to that generator rather than fixable settings on it:
 *
 *  1. It assigns a random noun from one global grocery pool to a random subcategory, so "Everyday
 *     Rice" landed under `cleaning` and "Premium Chickpeas" under `paper-toiletries`. Its own
 *     docstring says the pools are "deliberately generic grocery vocabulary rather than anything
 *     resembling a real Aheed or SriMart product" — it exists to make queries work harder, and
 *     nothing in it ever related a product to the category it was filed under.
 *  2. That single pool is groceries-only, so pointing it at SriMart — an ELECTRONICS vendor —
 *     produced "Value Lentils" under `sri-chargers-cables`.
 *
 * `generate-catalogue.ts` is therefore left entirely alone (its `GENERATOR_SEED` is load-bearing
 * for #489's reproducible measurement) and the storefront's second tier is curated here instead.
 *
 * A FLAT RECORD KEYED ON SUBCATEGORY SLUG, not nested inside `CATALOGUE`. The subcategory list
 * already lives there under `children`; duplicating the tree would create two places that must
 * agree about it. Keying on the child slug means this map is checked against the database, not
 * against the fixture's shape — and `seedSubcategoryProducts` skips any key with no matching
 * category, which is what lets SriMart's entries sit in the same structure harmlessly when only
 * Aheed is seeded.
 */
const AHEED_SUBCATEGORY_PRODUCTS: Record<string, CatalogueProduct[]> = {
  "fresh-fruit": [
    {
      slug: "bananas-1kg",
      name: "Bananas 1kg",
      description: "Ripe Fairtrade bananas, sold loose by the kilo.",
      basePrice: 119,
      unitLabel: "£1.19 / kg",
      quantity: 80,
      isFresh: true,
    },
    {
      slug: "royal-gala-apples-6pk",
      name: "Royal Gala Apples 6 pack",
      description: "Crisp, sweet Royal Gala apples.",
      basePrice: 189,
      unitLabel: "£1.89 / 6 pack",
      quantity: 60,
      isFresh: true,
    },
  ],
  "fresh-vegetables": [
    {
      slug: "brown-onions-2kg",
      name: "Brown Onions 2kg",
      description: "Everyday brown onions, the base of most curries.",
      basePrice: 179,
      unitLabel: "£1.79 / 2kg",
      quantity: 70,
      isFresh: true,
    },
    {
      slug: "vine-tomatoes-500g",
      name: "Vine Tomatoes 500g",
      description: "Ripened-on-the-vine salad tomatoes.",
      basePrice: 149,
      unitLabel: "£1.49 / 500g",
      quantity: 55,
      isFresh: true,
    },
  ],
  "herbs-salads": [
    {
      slug: "fresh-coriander-100g",
      name: "Fresh Coriander 100g",
      description: "Large bunch of fresh coriander.",
      basePrice: 89,
      unitLabel: "£0.89 / bunch",
      quantity: 45,
      isFresh: true,
    },
    {
      slug: "baby-spinach-200g",
      name: "Baby Spinach 200g",
      description: "Washed and ready-to-eat baby spinach leaves.",
      basePrice: 139,
      unitLabel: "£1.39 / 200g",
      quantity: 40,
      isFresh: true,
    },
  ],
  "bread-loaves": [
    {
      slug: "white-farmhouse-loaf-800g",
      name: "White Farmhouse Loaf 800g",
      description: "Thick-sliced soft white farmhouse loaf.",
      basePrice: 135,
      unitLabel: "£1.35 / loaf",
      quantity: 40,
    },
    {
      slug: "wholemeal-bloomer-800g",
      name: "Wholemeal Bloomer 800g",
      description: "Stoneground wholemeal bloomer, baked daily.",
      basePrice: 155,
      unitLabel: "£1.55 / loaf",
      quantity: 35,
    },
  ],
  pastries: [
    {
      slug: "butter-croissants-4pk",
      name: "Butter Croissants 4 pack",
      description: "All-butter croissants, baked in store.",
      basePrice: 199,
      unitLabel: "£1.99 / 4 pack",
      quantity: 30,
    },
    {
      slug: "pain-au-chocolat-4pk",
      name: "Pain au Chocolat 4 pack",
      description: "Flaky pastry with dark chocolate batons.",
      basePrice: 225,
      unitLabel: "£2.25 / 4 pack",
      quantity: 28,
    },
  ],
  "cakes-desserts": [
    {
      slug: "victoria-sponge-cake",
      name: "Victoria Sponge Cake",
      description: "Classic sponge layered with jam and buttercream.",
      basePrice: 549,
      unitLabel: "£5.49 each",
      quantity: 15,
    },
    {
      slug: "chocolate-fudge-cake",
      name: "Chocolate Fudge Cake",
      description: "Rich chocolate sponge with fudge icing.",
      basePrice: 599,
      unitLabel: "£5.99 each",
      quantity: 15,
    },
  ],
  "milk-cream": [
    {
      slug: "whole-milk-2l",
      name: "Whole Milk 2L",
      description: "Fresh British whole milk.",
      basePrice: 145,
      unitLabel: "£1.45 / 2L",
      quantity: 60,
      isFresh: true,
    },
    {
      slug: "double-cream-300ml",
      name: "Double Cream 300ml",
      description: "Thick double cream for cooking and desserts.",
      basePrice: 125,
      unitLabel: "£1.25 / 300ml",
      quantity: 40,
      isFresh: true,
    },
  ],
  "cheese-paneer": [
    {
      slug: "mild-cheddar-400g",
      name: "Mild Cheddar 400g",
      description: "Creamy mild cheddar block.",
      basePrice: 289,
      unitLabel: "£2.89 / 400g",
      quantity: 35,
    },
    {
      slug: "fresh-paneer-226g",
      name: "Fresh Paneer 226g",
      description: "Firm Indian cheese, ideal for curries and grilling.",
      basePrice: 275,
      unitLabel: "£2.75 / 226g",
      quantity: 30,
      isHalal: true,
    },
  ],
  "eggs-butter": [
    {
      slug: "large-free-range-eggs-12pk",
      name: "Large Free Range Eggs 12 pack",
      description: "British free range eggs, box of twelve.",
      basePrice: 315,
      unitLabel: "£3.15 / dozen",
      quantity: 45,
      isFresh: true,
    },
    {
      slug: "salted-butter-250g",
      name: "Salted Butter 250g",
      description: "Traditional churned salted butter.",
      basePrice: 219,
      unitLabel: "£2.19 / 250g",
      quantity: 40,
    },
  ],
  "lamb-mutton": [
    {
      slug: "halal-lamb-shoulder-1kg",
      name: "Halal Lamb Shoulder 1kg",
      description: "Bone-in lamb shoulder, HMC certified.",
      basePrice: 1099,
      unitLabel: "£10.99 / kg",
      quantity: 20,
      isHalal: true,
      isFresh: true,
    },
    {
      slug: "halal-mutton-curry-cut-1kg",
      name: "Halal Mutton Curry Cut 1kg",
      description: "Bone-in mutton pieces cut for slow curries.",
      basePrice: 949,
      unitLabel: "£9.49 / kg",
      quantity: 20,
      isHalal: true,
      isFresh: true,
    },
  ],
  "chicken-poultry": [
    {
      slug: "halal-chicken-thighs-1kg",
      name: "Halal Chicken Thighs 1kg",
      description: "Skin-on bone-in chicken thighs, HMC certified.",
      basePrice: 499,
      unitLabel: "£4.99 / kg",
      quantity: 30,
      isHalal: true,
      isFresh: true,
    },
    {
      slug: "halal-whole-chicken-1-5kg",
      name: "Halal Whole Chicken 1.5kg",
      description: "Whole fresh chicken, HMC certified.",
      basePrice: 649,
      unitLabel: "£6.49 each",
      quantity: 25,
      isHalal: true,
      isFresh: true,
    },
  ],
  "beef-mince": [
    {
      slug: "halal-beef-mince-500g",
      name: "Halal Beef Mince 500g",
      description: "Lean 12% fat beef mince, HMC certified.",
      basePrice: 449,
      unitLabel: "£4.49 / 500g",
      quantity: 30,
      isHalal: true,
      isFresh: true,
    },
    {
      slug: "halal-beef-curry-cubes-500g",
      name: "Halal Beef Curry Cubes 500g",
      description: "Diced braising beef for curries and stews.",
      basePrice: 529,
      unitLabel: "£5.29 / 500g",
      quantity: 25,
      isHalal: true,
      isFresh: true,
    },
  ],
  "rice-grains": [
    {
      slug: "basmati-rice-10kg",
      name: "Basmati Rice 10kg",
      description: "Aged extra-long grain basmati, catering sack.",
      basePrice: 1899,
      unitLabel: "£18.99 / 10kg",
      quantity: 25,
      origin: "India",
    },
    {
      slug: "chapatti-atta-5kg",
      name: "Chapatti Atta 5kg",
      description: "Fine wholemeal flour for chapatti and roti.",
      basePrice: 649,
      unitLabel: "£6.49 / 5kg",
      quantity: 30,
    },
  ],
  "lentils-pulses": [
    {
      slug: "red-split-lentils-2kg",
      name: "Red Split Lentils 2kg",
      description: "Masoor dal, quick cooking.",
      basePrice: 399,
      unitLabel: "£3.99 / 2kg",
      quantity: 40,
    },
    {
      slug: "chana-dal-2kg",
      name: "Chana Dal 2kg",
      description: "Split Bengal gram, a South Asian staple.",
      basePrice: 429,
      unitLabel: "£4.29 / 2kg",
      quantity: 35,
    },
  ],
  "cooking-oils": [
    {
      slug: "sunflower-oil-3l",
      name: "Sunflower Oil 3L",
      description: "Everyday sunflower oil for frying.",
      basePrice: 749,
      unitLabel: "£7.49 / 3L",
      quantity: 30,
    },
    {
      slug: "extra-virgin-olive-oil-1l",
      name: "Extra Virgin Olive Oil 1L",
      description: "Cold-pressed extra virgin olive oil.",
      basePrice: 899,
      unitLabel: "£8.99 / L",
      quantity: 25,
    },
  ],
  "south-asian": [
    {
      slug: "pure-ghee-1kg",
      name: "Pure Ghee 1kg",
      description: "Clarified butter for traditional cooking.",
      basePrice: 1149,
      unitLabel: "£11.49 / kg",
      quantity: 20,
    },
    {
      slug: "mango-pickle-400g",
      name: "Mango Pickle 400g",
      description: "Hot and tangy mango pickle in oil.",
      basePrice: 259,
      unitLabel: "£2.59 / 400g",
      quantity: 30,
    },
  ],
  "middle-eastern": [
    {
      slug: "medjool-dates-500g",
      name: "Medjool Dates 500g",
      description: "Large soft Medjool dates.",
      basePrice: 549,
      unitLabel: "£5.49 / 500g",
      quantity: 25,
      origin: "Jordan",
    },
    {
      slug: "tahini-paste-300g",
      name: "Tahini Paste 300g",
      description: "Smooth sesame paste for hummus and dressings.",
      basePrice: 329,
      unitLabel: "£3.29 / 300g",
      quantity: 25,
    },
  ],
  "african-caribbean": [
    {
      slug: "scotch-bonnet-chillies-100g",
      name: "Scotch Bonnet Chillies 100g",
      description: "Fiery Scotch bonnet peppers.",
      basePrice: 129,
      unitLabel: "£1.29 / 100g",
      quantity: 30,
      isFresh: true,
    },
    {
      slug: "plantain-3pk",
      name: "Plantain 3 pack",
      description: "Ripe plantain, ideal for frying.",
      basePrice: 175,
      unitLabel: "£1.75 / 3 pack",
      quantity: 30,
      isFresh: true,
    },
  ],
  "tea-coffee": [
    {
      slug: "kenyan-loose-tea-1kg",
      name: "Kenyan Loose Tea 1kg",
      description: "Strong loose-leaf tea for masala chai.",
      basePrice: 899,
      unitLabel: "£8.99 / kg",
      quantity: 25,
      origin: "Kenya",
    },
    {
      slug: "ground-coffee-500g",
      name: "Ground Coffee 500g",
      description: "Medium roast ground coffee.",
      basePrice: 649,
      unitLabel: "£6.49 / 500g",
      quantity: 20,
    },
  ],
  "juices-soft-drinks": [
    {
      // NOT "orange-juice-1l" — that slug is already a top-level Beverages product. Product
      // slugs are unique per vendor, so a collision here silently seeds one fewer row rather
      // than failing, which is how this subcategory first came out with a single product.
      slug: "apple-juice-1l",
      name: "Apple Juice 1L",
      description: "Pressed apple juice, not from concentrate.",
      basePrice: 179,
      unitLabel: "£1.79 / L",
      quantity: 40,
    },
    {
      slug: "cola-6x330ml",
      name: "Cola 6 x 330ml",
      description: "Six-pack of classic cola cans.",
      basePrice: 329,
      unitLabel: "£3.29 / 6 pack",
      quantity: 35,
    },
  ],
  "water-mixers": [
    {
      slug: "still-water-6x1-5l",
      name: "Still Water 6 x 1.5L",
      description: "Still natural mineral water, multipack.",
      basePrice: 289,
      unitLabel: "£2.89 / 6 pack",
      quantity: 40,
    },
    {
      slug: "sparkling-water-6x1l",
      name: "Sparkling Water 6 x 1L",
      description: "Carbonated spring water, multipack.",
      basePrice: 279,
      unitLabel: "£2.79 / 6 pack",
      quantity: 35,
    },
  ],
  "crisps-namkeen": [
    {
      slug: "bombay-mix-400g",
      name: "Bombay Mix 400g",
      description: "Crunchy spiced savoury snack mix.",
      basePrice: 199,
      unitLabel: "£1.99 / 400g",
      quantity: 40,
    },
    {
      slug: "salted-crisps-6pk",
      name: "Salted Crisps 6 pack",
      description: "Ready salted potato crisps, six bags.",
      basePrice: 179,
      unitLabel: "£1.79 / 6 pack",
      quantity: 45,
    },
  ],
  "biscuits-sweets": [
    {
      slug: "digestive-biscuits-400g",
      name: "Digestive Biscuits 400g",
      description: "Wheatmeal digestive biscuits.",
      basePrice: 129,
      unitLabel: "£1.29 / 400g",
      quantity: 45,
    },
    {
      slug: "gulab-jamun-1kg",
      name: "Gulab Jamun 1kg",
      description: "Soft milk dumplings in rose syrup.",
      basePrice: 599,
      unitLabel: "£5.99 / kg",
      quantity: 20,
    },
  ],
  "nuts-dried-fruit": [
    {
      slug: "whole-almonds-500g",
      name: "Whole Almonds 500g",
      description: "Natural whole almonds.",
      basePrice: 549,
      unitLabel: "£5.49 / 500g",
      quantity: 30,
    },
    {
      slug: "sultanas-500g",
      name: "Sultanas 500g",
      description: "Soft golden sultanas for baking and snacking.",
      basePrice: 239,
      unitLabel: "£2.39 / 500g",
      quantity: 30,
    },
  ],
  cleaning: [
    {
      slug: "washing-up-liquid-900ml",
      name: "Washing Up Liquid 900ml",
      description: "Concentrated washing up liquid.",
      basePrice: 189,
      unitLabel: "£1.89 / 900ml",
      quantity: 40,
    },
    {
      slug: "multi-surface-spray-750ml",
      name: "Multi-Surface Spray 750ml",
      description: "Antibacterial cleaner for kitchen surfaces.",
      basePrice: 165,
      unitLabel: "£1.65 / 750ml",
      quantity: 40,
    },
  ],
  "kitchen-foil": [
    {
      slug: "aluminium-foil-30m",
      name: "Aluminium Foil 30m",
      description: "Catering-width kitchen foil.",
      basePrice: 249,
      unitLabel: "£2.49 / 30m",
      quantity: 35,
    },
    {
      slug: "cling-film-30m",
      name: "Cling Film 30m",
      description: "Food-safe cling film with cutter.",
      basePrice: 199,
      unitLabel: "£1.99 / 30m",
      quantity: 35,
    },
  ],
  "paper-toiletries": [
    {
      slug: "kitchen-roll-4pk",
      name: "Kitchen Roll 4 pack",
      description: "Absorbent two-ply kitchen towels.",
      basePrice: 329,
      unitLabel: "£3.29 / 4 pack",
      quantity: 40,
    },
    {
      slug: "toilet-tissue-9pk",
      name: "Toilet Tissue 9 pack",
      description: "Soft three-ply toilet tissue.",
      basePrice: 429,
      unitLabel: "£4.29 / 9 pack",
      quantity: 35,
    },
  ],
};

/** SriMart sells electronics and homeware — see the note above about why the generated pool
 *  produced groceries here and must never be used for this vendor. */
const SRIMART_SUBCATEGORY_PRODUCTS: Record<string, CatalogueProduct[]> = {
  "sri-audio": [
    {
      slug: "sri-over-ear-headphones",
      name: "Over-Ear Headphones",
      description: "Wireless over-ear headphones with active noise cancelling.",
      basePrice: 5999,
      unitLabel: "£59.99 each",
      quantity: 12,
    },
    {
      slug: "sri-bluetooth-speaker",
      name: "Portable Bluetooth Speaker",
      description: "Water-resistant speaker with 12-hour battery life.",
      basePrice: 3499,
      unitLabel: "£34.99 each",
      quantity: 18,
    },
  ],
  "sri-chargers-cables": [
    {
      slug: "sri-usb-c-cable-2m",
      name: "USB-C Braided Cable 2m",
      description: "Nylon-braided USB-C to USB-C cable, 100W rated.",
      basePrice: 999,
      unitLabel: "£9.99 each",
      quantity: 40,
    },
    {
      slug: "sri-gan-charger-65w",
      name: "65W GaN Wall Charger",
      description: "Compact three-port GaN charger for laptops and phones.",
      basePrice: 2999,
      unitLabel: "£29.99 each",
      quantity: 22,
    },
  ],
  "sri-lighting": [
    {
      slug: "sri-smart-led-bulb",
      name: "Smart LED Bulb",
      description: "Colour-changing Wi-Fi bulb, B22 fitting.",
      basePrice: 1299,
      unitLabel: "£12.99 each",
      quantity: 30,
    },
    {
      slug: "sri-led-strip-5m",
      name: "LED Strip Light 5m",
      description: "Adhesive colour LED strip with remote.",
      basePrice: 1799,
      unitLabel: "£17.99 / 5m",
      quantity: 25,
    },
  ],
  "sri-storage": [
    {
      slug: "sri-portable-ssd-1tb",
      name: "Portable SSD 1TB",
      description: "USB 3.2 external solid state drive.",
      basePrice: 8999,
      unitLabel: "£89.99 each",
      quantity: 10,
    },
    {
      slug: "sri-microsd-128gb",
      name: "microSD Card 128GB",
      description: "Class 10 microSD card with SD adapter.",
      basePrice: 1499,
      unitLabel: "£14.99 each",
      quantity: 35,
    },
  ],
};

/**
 * Create the curated subcategory products above, keyed on the SUBCATEGORY's slug.
 *
 * Its own pass, for the same reason `seedSubcategories` and `seedFeaturedProducts` are: every
 * other path returns early once a category exists, so a database seeded before this map existed
 * would never gain these rows. Idempotency is per PRODUCT slug rather than per category, so a
 * later addition to one subcategory reaches a database that already holds the other.
 *
 * Uploads each product's placeholder object BEFORE writing rows, matching `seedCatalogue`'s
 * ordering and #502's rule that a row and the object it names must not be written such that one
 * can exist without the other.
 */
async function seedSubcategoryProducts(vendorId: string, map: Record<string, CatalogueProduct[]>) {
  const subSlugs = Object.keys(map);
  if (subSlugs.length === 0) return;

  const categories = await prisma.category.findMany({
    where: { vendorId, slug: { in: subSlugs } },
    select: { id: true, slug: true },
  });
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const existing = new Set(
    (await prisma.product.findMany({ where: { vendorId }, select: { slug: true } })).map(
      (p) => p.slug,
    ),
  );

  const placeholderImage = readFileSync(
    join(import.meta.dirname, "seed-assets", "placeholder-product.svg"),
    "utf8",
  );

  let created = 0;
  for (const [subSlug, products] of Object.entries(map)) {
    const categoryId = categoryIdBySlug.get(subSlug);
    // A subcategory can legitimately be absent — SriMart is only seeded when both host vars are
    // set, and this map is shared across vendors that do not have each other's categories.
    if (!categoryId) continue;

    const pending = products.filter((p) => !existing.has(p.slug));
    if (pending.length === 0) continue;

    for (const product of pending) {
      await putTracked(`products/${product.slug}/main.svg`, placeholderImage, "image/svg+xml");
    }

    for (const product of pending) {
      await prisma.product.create({
        data: {
          vendorId,
          slug: product.slug,
          name: product.name,
          description: product.description,
          categoryId,
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
          inventory: { create: { vendorId, quantity: product.quantity } },
        },
      });
      created++;
    }
  }

  console.log(
    created === 0
      ? `all subcategory products already exist for ${vendorId} — skipping`
      : `seeded ${created} subcategory products for ${vendorId}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
