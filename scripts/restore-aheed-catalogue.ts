import "dotenv/config";
import * as fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import type { CatalogueBackup } from "./backup-aheed-catalogue";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Neither DIRECT_URL nor DATABASE_URL is set in environment.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

export async function verifyAndRestoreBackup(
  backupFilePath: string,
  options: { apply?: boolean; targetVendorId?: string } = {}
) {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at: ${backupFilePath}`);
  }

  const raw = fs.readFileSync(backupFilePath, "utf8");
  const backup: CatalogueBackup = JSON.parse(raw);

  console.log("=== Backup Verification ===");
  console.log(`Timestamp:       ${backup.metadata.timestamp}`);
  console.log(`Source Vendor:   ${backup.vendor.name} (${backup.vendor.id})`);
  console.log(`Product Count:   ${backup.products.length}`);
  console.log(`Category Count:  ${backup.categories.length}`);
  console.log(`Inventory Rows:  ${backup.metadata.inventoryCount}`);
  console.log(`Order Count:     ${backup.metadata.orderCount}`);
  console.log(`Order Items:     ${backup.metadata.orderItemCount}`);

  // Basic structural validations
  if (!backup.vendor || !backup.products || !backup.categories) {
    throw new Error("Invalid backup format: missing vendor, products, or categories");
  }

  const targetVendorId = options.targetVendorId || backup.vendor.id;
  const vendor = await prisma.vendor.findUnique({
    where: { id: targetVendorId },
    select: { id: true, slug: true, name: true },
  });

  if (!vendor) {
    throw new Error(`Target vendor ${targetVendorId} does not exist in target database.`);
  }

  console.log(`Target Vendor:   ${vendor.name} (${vendor.id})`);

  if (!options.apply) {
    console.log("\n[DRY RUN VERIFICATION SUCCESSFUL] Backup file is valid and can be restored.");
    return {
      success: true,
      mode: "DRY_RUN",
      productsRestorable: backup.products.length,
      categoriesRestorable: backup.categories.length,
    };
  }

  console.log("\n[APPLYING RESTORATION] Restoring catalogue to target database...");

  // Restore categories
  for (const cat of backup.categories) {
    await prisma.category.upsert({
      where: {
        id: cat.id,
      },
      update: {
        name: cat.name,
        slug: cat.slug,
        imageKey: cat.imageKey,
        sortOrder: cat.sortOrder,
      },
      create: {
        id: cat.id,
        vendorId: targetVendorId,
        name: cat.name,
        slug: cat.slug,
        imageKey: cat.imageKey,
        sortOrder: cat.sortOrder,
        parentId: cat.parentId,
      },
    });
  }

  // Restore products and inventories
  let restoredCount = 0;
  for (const prod of backup.products) {
    await prisma.product.upsert({
      where: { id: prod.id },
      update: {
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        basePrice: prod.basePrice,
        unitLabel: prod.unitLabel,
        isActive: prod.isActive,
        netContentAmount: prod.netContentAmount,
        netContentUnit: prod.netContentUnit as any,
        origin: prod.origin,
        isHalal: prod.isHalal,
        isFresh: prod.isFresh,
        isOrganic: prod.isOrganic,
        isVegetarian: prod.isVegetarian,
        isGlutenFree: prod.isGlutenFree,
        isHmcCertified: prod.isHmcCertified,
        isFeatured: prod.isFeatured,
      },
      create: {
        id: prod.id,
        vendorId: targetVendorId,
        categoryId: prod.categoryId,
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        basePrice: prod.basePrice,
        unitLabel: prod.unitLabel,
        isActive: prod.isActive,
        netContentAmount: prod.netContentAmount,
        netContentUnit: prod.netContentUnit as any,
        origin: prod.origin,
        isHalal: prod.isHalal,
        isFresh: prod.isFresh,
        isOrganic: prod.isOrganic,
        isVegetarian: prod.isVegetarian,
        isGlutenFree: prod.isGlutenFree,
        isHmcCertified: prod.isHmcCertified,
        isFeatured: prod.isFeatured,
      },
    });

    if (prod.inventory) {
      await prisma.inventory.upsert({
        where: { productId: prod.id },
        update: {
          quantity: prod.inventory.quantity,
          stockMode: prod.inventory.stockMode as any,
          lowStockThreshold: prod.inventory.lowStockThreshold,
          expectedRestockDate: prod.inventory.expectedRestockDate
            ? new Date(prod.inventory.expectedRestockDate)
            : null,
        },
        create: {
          vendorId: targetVendorId,
          productId: prod.id,
          quantity: prod.inventory.quantity,
          stockMode: prod.inventory.stockMode as any,
          lowStockThreshold: prod.inventory.lowStockThreshold,
          expectedRestockDate: prod.inventory.expectedRestockDate
            ? new Date(prod.inventory.expectedRestockDate)
            : null,
        },
      });
    }
    restoredCount++;
  }

  console.log(`[RESTORE COMPLETED] Restored ${restoredCount} products with their inventory records.`);
  return {
    success: true,
    mode: "APPLIED",
    productsRestored: restoredCount,
  };
}

if (process.argv[1] && process.argv[1].endsWith("restore-aheed-catalogue.ts")) {
  const backupFlagIndex = process.argv.indexOf("--backup");
  const file = backupFlagIndex !== -1
    ? process.argv[backupFlagIndex + 1]
    : process.argv[2] && !process.argv[2].startsWith("--")
      ? process.argv[2]
      : undefined;
  const apply = process.argv.includes("--apply");
  if (!file) {
    console.error("Usage: npx tsx scripts/restore-aheed-catalogue.ts <backup-file.json> [--apply]");
    process.exit(1);
  }

  verifyAndRestoreBackup(file, { apply })
    .catch((err) => {
      console.error("Restore failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
