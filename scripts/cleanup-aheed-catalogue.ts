import "dotenv/config";
import * as fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { backupCatalogue } from "./backup-aheed-catalogue";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Neither DIRECT_URL nor DATABASE_URL is set in environment.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

export interface CleanupOptions {
  vendorId: string;
  confirmReset?: boolean;
  skipAutoBackup?: boolean;
}

export async function cleanupCatalogue(options: CleanupOptions) {
  const { vendorId, confirmReset = false, skipAutoBackup = false } = options;

  console.log("=== ONE-OFF CATALOGUE CLEANUP ===");
  console.log(`Target Vendor ID: ${vendorId}`);

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, slug: true, name: true },
  });

  if (!vendor) {
    throw new Error(`Vendor ${vendorId} not found.`);
  }

  // Pre-cleanup audit counts
  const initialProducts = await prisma.product.findMany({
    where: { vendorId },
    select: {
      id: true,
      name: true,
      isActive: true,
      inventory: {
        select: {
          id: true,
          quantity: true,
          stockMode: true,
        },
      },
      _count: {
        select: { orderItems: true },
      },
    },
  });

  const orderCount = await prisma.order.count({ where: { vendorId } });
  const orderItemCount = await prisma.orderItem.count({ where: { order: { vendorId } } });

  console.log(`Current State:`);
  console.log(`- Products: ${initialProducts.length} (Active: ${initialProducts.filter((p) => p.isActive).length})`);
  console.log(`- Orders:   ${orderCount}`);
  console.log(`- OrderItems: ${orderItemCount}`);

  if (!confirmReset) {
    console.log("\n[DRY RUN ONLY] No changes written to database.");
    console.log("To apply the one-off reset, re-run with: --confirm-reset");
    return {
      dryRun: true,
      productsToDeactivate: initialProducts.length,
      ordersPreserved: orderCount,
      orderItemsPreserved: orderItemCount,
    };
  }

  // Pre-cleanup auto backup if not skipped
  if (!skipAutoBackup) {
    console.log("\n[SAFEGUARD] Generating pre-cleanup backup before reset...");
    const backupFile = await backupCatalogue(vendorId);
    console.log(`[SAFEGUARD] Pre-cleanup backup created: ${backupFile}`);
  }

  console.log("\n[APPLYING CLEANUP] Soft-deactivating products and resetting inventory...");

  let updatedProducts = 0;
  let auditedInventories = 0;

  for (const prod of initialProducts) {
    // 1. Deactivate product
    await prisma.product.update({
      where: { id: prod.id },
      data: {
        isActive: false,
      },
    });
    updatedProducts++;

    // 2. Reset inventory and write audit log
    if (prod.inventory) {
      const prevQty = prod.inventory.quantity;
      const prevMode = prod.inventory.stockMode;

      // Update inventory to 0 and UNKNOWN
      await prisma.inventory.update({
        where: { id: prod.inventory.id },
        data: {
          quantity: 0,
          stockMode: "UNKNOWN",
          version: { increment: 1 },
        },
      });

      // Insert audit log
      await prisma.inventoryAuditLog.create({
        data: {
          vendorId,
          productId: prod.id,
          inventoryId: prod.inventory.id,
          previousQuantity: prevQty,
          newQuantity: 0,
          changeAmount: -prevQty,
          previousStockMode: prevMode,
          newStockMode: "UNKNOWN",
          source: "SYSTEM_INITIAL_RESET",
          reason: "One-off initial catalogue reset for independent stock management",
          actorType: "SYSTEM",
        },
      });
      auditedInventories++;
    }
  }

  // Post-cleanup verification
  const postOrderCount = await prisma.order.count({ where: { vendorId } });
  const postOrderItemCount = await prisma.orderItem.count({ where: { order: { vendorId } } });
  const postActiveProducts = await prisma.product.count({ where: { vendorId, isActive: true } });

  console.log("\n=== POST-CLEANUP VERIFICATION ===");
  console.log(`- Deactivated Products:   ${updatedProducts}`);
  console.log(`- Active Products Left:   ${postActiveProducts} (Must be 0)`);
  console.log(`- Audited Inventory Rows: ${auditedInventories}`);
  console.log(`- Orders Preserved:       ${postOrderCount} (Initial: ${orderCount})`);
  console.log(`- OrderItems Preserved:   ${postOrderItemCount} (Initial: ${orderItemCount})`);

  if (postOrderCount !== orderCount || postOrderItemCount !== orderItemCount) {
    throw new Error("CRITICAL SAFETY VIOLATION: Orders or OrderItems were modified during cleanup!");
  }

  return {
    dryRun: false,
    updatedProducts,
    auditedInventories,
    postActiveProducts,
    ordersPreserved: postOrderCount,
    orderItemsPreserved: postOrderItemCount,
  };
}

if (process.argv[1] && process.argv[1].endsWith("cleanup-aheed-catalogue.ts")) {
  const vendorArgIndex = process.argv.indexOf("--vendor-id");
  const vendorId = vendorArgIndex !== -1 ? process.argv[vendorArgIndex + 1] : "a4ed0000-0000-4000-a000-000000000001";
  const confirmReset = process.argv.includes("--confirm-reset");

  cleanupCatalogue({ vendorId, confirmReset })
    .catch((err) => {
      console.error("Cleanup failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
