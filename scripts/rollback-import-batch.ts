import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Neither DIRECT_URL nor DATABASE_URL is set in environment.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

export interface RollbackOptions {
  batchId: string;
  vendorId: string;
  apply?: boolean;
}

export async function rollbackBatch(options: RollbackOptions) {
  const { batchId, vendorId, apply = false } = options;

  console.log("=== ROLLBACK IMPORT BATCH ===");
  console.log(`Batch ID:  ${batchId}`);
  console.log(`Vendor ID: ${vendorId}`);
  console.log(`Mode:      ${apply ? "APPLY (deleting unmodified batch products)" : "DRY RUN (preview only)"}`);

  const productsInBatch = await prisma.product.findMany({
    where: {
      vendorId,
      importBatchId: batchId,
    },
    include: {
      inventory: true,
      _count: {
        select: {
          orderItems: true,
          reviews: true,
          favourites: true,
        },
      },
    },
  });

  console.log(`Found ${productsInBatch.length} products associated with batch ${batchId}.`);

  const deletableProducts: typeof productsInBatch = [];
  const preservedProducts: Array<{ id: string; name: string; plu: string | null; reason: string }> = [];

  for (const prod of productsInBatch) {
    if (prod._count.orderItems > 0) {
      preservedProducts.push({
        id: prod.id,
        name: prod.name,
        plu: prod.plu,
        reason: `Linked to ${prod._count.orderItems} historical order items`,
      });
      continue;
    }

    if (prod.isManuallyEdited) {
      preservedProducts.push({
        id: prod.id,
        name: prod.name,
        plu: prod.plu,
        reason: `Has staff manual edits (${prod.manuallyEditedFields.join(", ")})`,
      });
      continue;
    }

    if (prod.inventory && (prod.inventory.stockMode !== "UNKNOWN" || prod.inventory.quantity > 0)) {
      preservedProducts.push({
        id: prod.id,
        name: prod.name,
        plu: prod.plu,
        reason: `Has verified physical stock (quantity: ${prod.inventory.quantity}, mode: ${prod.inventory.stockMode})`,
      });
      continue;
    }

    deletableProducts.push(prod);
  }

  console.log(`\nAnalysis Results:`);
  console.log(`- Total Batch Products:    ${productsInBatch.length}`);
  console.log(`- Safely Reversible:       ${deletableProducts.length}`);
  console.log(`- Preserved (Protected):   ${preservedProducts.length}`);

  if (preservedProducts.length > 0) {
    console.log(`Sample Preserved Products:`);
    for (const p of preservedProducts.slice(0, 5)) {
      console.log(`  - [PLU ${p.plu}] ${p.name}: ${p.reason}`);
    }
  }

  if (!apply) {
    console.log("\n[DRY RUN ONLY] No records deleted. Pass --apply to execute rollback.");
    return {
      dryRun: true,
      batchId,
      totalBatchProducts: productsInBatch.length,
      deletableCount: deletableProducts.length,
      preservedCount: preservedProducts.length,
      preservedProducts,
    };
  }

  console.log("\n[APPLYING ROLLBACK] Deleting unmodified products and audit logs...");

  let deletedCount = 0;
  for (const prod of deletableProducts) {
    // 1. Delete audit logs
    await prisma.inventoryAuditLog.deleteMany({
      where: { productId: prod.id },
    });

    // 2. Delete inventory
    if (prod.inventory) {
      await prisma.inventory.delete({
        where: { id: prod.inventory.id },
      });
    }

    // 3. Delete product
    await prisma.product.delete({
      where: { id: prod.id },
    });
    deletedCount++;
  }

  console.log(`[ROLLBACK COMPLETE] Deleted ${deletedCount} unedited products; preserved ${preservedProducts.length} protected products.`);

  return {
    dryRun: false,
    batchId,
    deletedCount,
    preservedCount: preservedProducts.length,
    preservedProducts,
  };
}

if (process.argv[1] && process.argv[1].endsWith("rollback-import-batch.ts")) {
  const batchFlagIndex = process.argv.indexOf("--batch-id");
  const batchIdArg = batchFlagIndex !== -1
    ? process.argv[batchFlagIndex + 1]
    : process.argv[2] && !process.argv[2].startsWith("--")
      ? process.argv[2]
      : undefined;
  const vendorArgIndex = process.argv.indexOf("--vendor-id");
  const vendorId = vendorArgIndex !== -1 ? process.argv[vendorArgIndex + 1] : "a4ed0000-0000-4000-a000-000000000001";
  const apply = process.argv.includes("--apply");

  if (!batchIdArg) {
    console.error("Usage: npx tsx scripts/rollback-import-batch.ts <batchId> [--vendor-id <id>] [--apply]");
    process.exit(1);
  }

  rollbackBatch({ batchId: batchIdArg, vendorId, apply })
    .catch((err) => {
      console.error("Rollback failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
