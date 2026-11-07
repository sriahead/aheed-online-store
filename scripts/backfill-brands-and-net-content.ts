import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";
import { identifyProductBrand } from "../lib/catalogue-import/brand";
import { extractDetailedNetContent } from "../lib/catalogue-import/net-content";
import { randomUUID } from "node:crypto";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const env = parseEnvFile(
  process.argv.includes("--env-file")
    ? process.argv[process.argv.indexOf("--env-file") + 1]
    : "secrets/staging.vars",
);
const connectionString = env.DIRECT_URL || env.DATABASE_URL;

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

async function main() {
  const vendorId = "a4ed0000-0000-4000-a000-000000000001";
  const apply = process.argv.includes("--apply");

  console.log(`\n=== CATALOGUE BRAND & NET CONTENT BACKFILL ===`);
  console.log(`Host: ${connectionString.match(/@([^:/?]+)/)?.[1]}`);
  console.log(`Vendor: ${vendorId}`);
  console.log(`Mode: ${apply ? "APPLY (writing to database)" : "DRY RUN (preview only)"}`);

  const products = await prisma.product.findMany({
    where: { vendorId },
    select: {
      id: true,
      name: true,
      brandId: true,
      netContentAmount: true,
      netContentUnit: true,
      isManuallyEdited: true,
      manuallyEditedFields: true,
    },
  });

  const existingBrands = await prisma.brand.findMany({
    where: { vendorId },
  });

  const brandMap = new Map<string, { id: string; name: string; slug: string }>();
  for (const b of existingBrands) {
    brandMap.set(b.name.trim().toLowerCase(), b);
  }

  const knownBrandNames = Array.from(brandMap.values()).map((b) => b.name);
  const newBrandsToCreate = new Map<string, { id: string; name: string; slug: string }>();
  const productBrandUpdates: Array<{
    id: string;
    name: string;
    brandName: string;
    brandId: string;
  }> = [];
  const productNetContentUpdates: Array<{
    id: string;
    name: string;
    amount: number;
    unit: string;
  }> = [];

  for (const p of products) {
    const brandProtected = Boolean(
      p.isManuallyEdited && p.manuallyEditedFields?.includes("brandId"),
    );

    if (!brandProtected && p.brandId == null) {
      const candidate = identifyProductBrand(undefined, p.name, knownBrandNames);

      if (candidate.brandName && candidate.confidence === "HIGH") {
        const brandKey = candidate.brandName.trim().toLowerCase();
        let brand = brandMap.get(brandKey) ?? newBrandsToCreate.get(brandKey);

        if (!brand) {
          const brandId = randomUUID();
          const brandSlug = slugify(candidate.brandName) || `brand-${brandId.slice(0, 8)}`;
          brand = {
            id: brandId,
            name: candidate.brandName.trim(),
            slug: brandSlug,
          };
          newBrandsToCreate.set(brandKey, brand);
        }

        productBrandUpdates.push({
          id: p.id,
          name: p.name,
          brandName: brand.name,
          brandId: brand.id,
        });
      }
    }

    const netContentProtected = Boolean(
      p.isManuallyEdited && p.manuallyEditedFields?.includes("netContentAmount"),
    );

    if (!netContentProtected && p.netContentAmount == null) {
      const parsed = extractDetailedNetContent(p.name);
      if (parsed) {
        productNetContentUpdates.push({
          id: p.id,
          name: p.name,
          amount: parsed.amount,
          unit: parsed.unit,
        });
      }
    }
  }

  console.log(`\n--- ENRICHMENT STATS ---`);
  console.log(`Total Products in DB: ${products.length}`);
  console.log(`Unique Brands to create in DB: ${newBrandsToCreate.size}`);
  console.log(`Products to link to Brands: ${productBrandUpdates.length}`);
  console.log(`Products to enrich with Net Content: ${productNetContentUpdates.length}`);

  const brandCounts = new Map<string, number>();
  for (const item of productBrandUpdates) {
    brandCounts.set(item.brandName, (brandCounts.get(item.brandName) || 0) + 1);
  }
  const top20 = Array.from(brandCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  console.log(`\nTop 20 Identified Brands:`);
  for (const [name, count] of top20) {
    console.log(`  - ${name}: ${count} products`);
  }

  console.log(`\nSample Enriched Products:`);
  for (const s of productBrandUpdates.slice(0, 5)) {
    const nc = productNetContentUpdates.find((u) => u.id === s.id);
    const ncStr = nc ? ` | ${nc.amount} ${nc.unit}` : "";
    console.log(`  [${s.brandName}] ${s.name}${ncStr}`);
  }

  if (!apply) {
    console.log(`\n[DRY RUN COMPLETE] To apply to staging database, pass --apply flag.`);
    return;
  }

  console.log(`\n--- APPLYING TO DATABASE ---`);
  // 1. Create Brand rows
  if (newBrandsToCreate.size > 0) {
    console.log(`Writing ${newBrandsToCreate.size} brands...`);
    for (const brand of newBrandsToCreate.values()) {
      await prisma.brand.upsert({
        where: {
          vendorId_slug: {
            vendorId,
            slug: brand.slug,
          },
        },
        create: {
          id: brand.id,
          vendorId,
          name: brand.name,
          slug: brand.slug,
        },
        update: {},
      });
    }
    console.log(`Brands written successfully.`);
  }

  // 2. Update products
  console.log(`Updating products with brandId and net content...`);
  const brandById = new Map(productBrandUpdates.map((u) => [u.id, u]));
  const ncById = new Map(productNetContentUpdates.map((u) => [u.id, u]));
  const allIds = Array.from(
    new Set([
      ...productBrandUpdates.map((u) => u.id),
      ...productNetContentUpdates.map((u) => u.id),
    ]),
  );

  const CHUNK_SIZE = 50;
  let done = 0;
  for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
    const batch = allIds.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      batch.map((id) => {
        const b = brandById.get(id);
        const nc = ncById.get(id);
        const data: any = {};
        if (b) data.brandId = b.brandId;
        if (nc) {
          data.netContentAmount = nc.amount;
          data.netContentUnit = nc.unit;
        }
        return prisma.product.update({ where: { id }, data });
      }),
    );
    done += batch.length;
    if (done % 500 === 0 || done === allIds.length) {
      console.log(`  Updated ${done} / ${allIds.length} products...`);
    }
  }

  console.log(`\n[APPLY COMPLETE] ${allIds.length} products enriched.`);

  const finalBrands = await prisma.brand.findMany({
    where: { vendorId },
    select: { id: true, name: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
  const withProducts = finalBrands.filter((b) => b._count.products > 0);
  console.log(
    `Total Brands on Staging: ${finalBrands.length} (${withProducts.length} actively linked to products)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
