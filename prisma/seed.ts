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
    await upsertVendorDomain(SRIMART_VENDOR_ID, srimartHost);
  } else if (srimartHost && !aheedHost) {
    console.log("SEED_SRIMART_HOST set but SEED_AHEED_HOST is not — skipping SriMart to stay safe");
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
