import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";
import { readSourceGrid } from "./lib/read-spreadsheet";
import { resolveImportProfile } from "../lib/catalogue-import/default-profile";
import { readRows } from "../lib/catalogue-import/rows";
import { buildPlan } from "../lib/catalogue-import/plan";
import { applyPlan, type ImportDb } from "../lib/catalogue-import/apply";

const env = parseEnvFile(
  process.argv.includes("--env-file")
    ? process.argv[process.argv.indexOf("--env-file") + 1]
    : "secrets/staging.vars",
);
const connectionString = env.DIRECT_URL || env.DATABASE_URL;

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

const AHEED_VENDORS = [
  {
    id: "a4ed0000-0000-4000-a000-000000000001",
    name: "Aheed Food Centre",
    slug: "aheed-food-centre",
  },
  { id: "e8a3b100-0000-4000-a000-000000000004", name: "Aheed Superstore", slug: "aheedsuperstore" },
];

async function importForVendor(vendorId: string, vendorName: string, apply: boolean) {
  console.log(`\n========================================`);
  console.log(`IMPORTING FOR: ${vendorName} (${vendorId})`);
  console.log(`Mode: ${apply ? "APPLY (writing to database)" : "DRY RUN (preview only)"}`);
  console.log(`========================================`);

  const { grid } = readSourceGrid("docs/StockList.xls");

  const existingBrands = await prisma.brand.findMany({
    where: { vendorId },
    select: { name: true },
  });
  const knownBrands = existingBrands.map((b) => b.name);

  const baseProfile = resolveImportProfile(grid);
  const profile = { ...baseProfile, knownBrands };

  const readResult = readRows(grid, profile);
  if (!readResult.ok) {
    throw new Error(`Read error: ${readResult.error}`);
  }

  const plan = buildPlan(readResult.rows, profile);
  console.log(
    `Plan: ${plan.products.length} products, ${plan.categories.length} categories, ${plan.rejected.length} rejected`,
  );
  console.log(
    `Enriched brands in plan: ${plan.enrichedProducts.filter((p) => p.brandName != null).length}`,
  );
  console.log(
    `Enriched net content in plan: ${plan.enrichedProducts.filter((p) => p.netContentAmount != null).length}`,
  );

  if (!apply) {
    console.log(`[DRY RUN] Skipping database write.`);
    return;
  }

  console.log(`Applying plan to database...`);
  const result = await applyPlan(prisma as unknown as ImportDb, vendorId, plan, {
    enrichExisting: true,
  });

  console.log(`--- Apply Result ---`);
  console.log(`Products Created:   ${result.productsCreated}`);
  console.log(`Products Updated:   ${result.productsUpdated}`);
  console.log(`Categories Created: ${result.categoriesCreated}`);
  console.log(`Existing Unchanged: ${result.existingUnchanged}`);
  console.log(`Failed Depts:       ${result.failedDepartments}`);

  const finalBrands = await prisma.brand.findMany({
    where: { vendorId },
    select: {
      id: true,
      name: true,
      _count: { select: { products: true } },
    },
    orderBy: { name: "asc" },
  });

  console.log(`\nBrands in DB for ${vendorName}: ${finalBrands.length}`);
  const top10 = [...finalBrands].sort((a, b) => b._count.products - a._count.products).slice(0, 10);
  for (const b of top10) {
    console.log(` - ${b.name}: ${b._count.products} products`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const vendorArgIndex = process.argv.indexOf("--vendor");
  const targetVendorSlug = vendorArgIndex !== -1 ? process.argv[vendorArgIndex + 1] : null;

  const targetVendors = targetVendorSlug
    ? AHEED_VENDORS.filter((v) => v.slug === targetVendorSlug || v.id === targetVendorSlug)
    : AHEED_VENDORS;

  if (targetVendors.length === 0) {
    console.error(`Vendor '${targetVendorSlug}' not found.`);
    process.exit(1);
  }

  for (const v of targetVendors) {
    await importForVendor(v.id, v.name, apply);
  }
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
