import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";

const env = parseEnvFile(
  process.argv.includes("--env-file")
    ? process.argv[process.argv.indexOf("--env-file") + 1]
    : "secrets/merqify-staging.vars",
);
const connectionString = env.DIRECT_URL || env.DATABASE_URL;

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

const VENDOR_ID = "a4ed0000-0000-4000-a000-000000000001";

// Maps malformed brand names to canonical brand names
const BRAND_CORRECTIONS: Record<string, string> = {
  "SHAN KARAHI": "Shan",
  "SHAN PASANDA CURRY": "Shan",
  "SHAH TIKKIYA KABAB MAS": "Shan",
  "LAZIZA CUSTARD POWDER": "Laziza",
  "MAGGI CHILLI SAUCE": "Maggi",
  "HAMZA VEG SAMOSA": "Humza",
  "TAHIRA BEEF BURGERS 12S": "Tahira",
  "TAHIRA CHICKEN BURGERS 36S": "Tahira",
  "TAHIRA CHICKEN NUGGETS 50S": "Tahira",
  "T S WHOLE NUTMEG": "Tropical Sun",
  "VASELINE ORIGINAL": "Vaseline",
  "ALOE VERA": "", // clear brand if generic ingredient
  "AYURVEDIC BALM": "", // clear brand
  "SUNFLOWER  OIL": "", // clear brand
  "BOUSTAN MOULOUKHIYEH CHOPPED": "Boustan",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("Connecting to:", connectionString.match(/@([^:/?]+)/)?.[1]);

  for (const [badName, targetName] of Object.entries(BRAND_CORRECTIONS)) {
    const badBrand = await prisma.brand.findFirst({
      where: { vendorId: VENDOR_ID, name: badName },
      include: { products: { select: { id: true, name: true } } },
    });

    if (!badBrand) continue;

    console.log(`Processing "${badName}" (${badBrand.products.length} products)...`);

    if (targetName) {
      let targetBrand = await prisma.brand.findFirst({
        where: {
          vendorId: VENDOR_ID,
          name: { equals: targetName, mode: "insensitive" },
        },
      });

      if (!targetBrand) {
        targetBrand = await prisma.brand.create({
          data: {
            vendorId: VENDOR_ID,
            name: targetName,
            slug: slugify(targetName),
          },
        });
        console.log(`  Created canonical brand: "${targetName}"`);
      }

      // Move products
      for (const p of badBrand.products) {
        await prisma.product.update({
          where: { id: p.id },
          data: { brandId: targetBrand.id },
        });
        console.log(`  Moved "${p.name}" -> "${targetName}"`);
      }
    } else {
      // Clear brand
      for (const p of badBrand.products) {
        await prisma.product.update({
          where: { id: p.id },
          data: { brandId: null },
        });
        console.log(`  Cleared brand for "${p.name}"`);
      }
    }

    // Delete bad brand
    await prisma.brand.delete({ where: { id: badBrand.id } });
    console.log(`  Deleted bad brand: "${badName}"`);
  }

  // Delete any orphaned brands with 0 products (excluding newly created ones that have products)
  const allBrands = await prisma.brand.findMany({
    where: { vendorId: VENDOR_ID },
    include: { _count: { select: { products: true } } },
  });

  const empty = allBrands.filter((b) => b._count.products === 0 && b.name !== "Laila");
  for (const b of empty) {
    await prisma.brand.delete({ where: { id: b.id } });
    console.log(`Deleted empty brand: "${b.name}"`);
  }

  const remaining = await prisma.brand.findMany({
    where: { vendorId: VENDOR_ID },
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  console.log(`\nFinal Brand Count: ${remaining.length}`);
  console.log(remaining.map((b) => `${b.name} (${b._count.products})`).join(", "));
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
