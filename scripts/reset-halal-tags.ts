import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";

const env = parseEnvFile(
  process.argv.includes("--env-file")
    ? process.argv[process.argv.indexOf("--env-file") + 1]
    : "secrets/staging.vars",
);
const connectionString = env.DIRECT_URL || env.DATABASE_URL;

if (!connectionString) {
  console.error("No DATABASE_URL or DIRECT_URL found in environment");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

async function main() {
  const vendorId = "a4ed0000-0000-4000-a000-000000000001"; // Aheed Food Centre
  const apply = process.argv.includes("--apply");

  console.log(`\n=== RESET HALAL TAGS FOR AHEED FOOD CENTRE ===`);
  console.log(`Database Host: ${connectionString.match(/@([^:/?]+)/)?.[1]}`);
  console.log(`Target Vendor: ${vendorId} (Aheed Food Centre)`);
  console.log(
    `Mode: ${apply ? "APPLY (writing changes)" : "DRY RUN (preview only, pass --apply to execute)"}`,
  );

  const halalProducts = await prisma.product.findMany({
    where: {
      vendorId,
      OR: [
        { isHalal: true },
        { isHmcCertified: true },
        { hmcReference: { not: null } },
        { hmcVerifiedAt: { not: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      isHalal: true,
      isHmcCertified: true,
    },
  });

  console.log(
    `\nFound ${halalProducts.length} products with Halal/HMC tags under Aheed Food Centre.`,
  );

  if (halalProducts.length > 0) {
    console.log(`Sample products to be reset:`);
    halalProducts.slice(0, 10).forEach((p, idx) => {
      console.log(
        `  ${idx + 1}. [${p.id}] ${p.name} (isHalal: ${p.isHalal}, isHmc: ${p.isHmcCertified})`,
      );
    });
  }

  // Ensure other vendors (like SriMart) are not affected
  const otherVendorsCount = await prisma.product.count({
    where: {
      vendorId: { not: vendorId },
      isHalal: true,
    },
  });
  console.log(
    `Other vendors' halal products (isolated, will NOT be touched): ${otherVendorsCount}`,
  );

  if (!apply) {
    console.log(
      `\nDry run complete. No rows updated. Pass --apply to reset ${halalProducts.length} products.`,
    );
    return;
  }

  const result = await prisma.product.updateMany({
    where: {
      vendorId,
      OR: [
        { isHalal: true },
        { isHmcCertified: true },
        { hmcReference: { not: null } },
        { hmcVerifiedAt: { not: null } },
      ],
    },
    data: {
      isHalal: false,
      isHmcCertified: false,
      hmcReference: null,
      hmcVerifiedAt: null,
    },
  });

  console.log(`\nSuccessfully updated ${result.count} products.`);

  const remaining = await prisma.product.count({
    where: {
      vendorId,
      isHalal: true,
    },
  });

  console.log(`Verification: Remaining halal products for Aheed Food Centre = ${remaining}`);
}

main()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
