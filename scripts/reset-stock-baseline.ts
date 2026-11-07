/**
 * Reset Historical Stock Records — First Stock Baseline
 *
 * Implements Requirement 5 for Aheed Food Centre:
 *  - Verifies or creates a complete catalog & inventory backup before execution.
 *  - Removes previous inventory audit logs (historical movement records).
 *  - RETAINS all existing products, product information and current stock quantities untouched.
 *  - Establishes the current stock as the official opening inventory baseline (SYSTEM_INITIAL_RESET).
 *
 * Run:
 *   npx tsx --env-file .env scripts/reset-stock-baseline.ts [--confirm-baseline]
 */

import { parseArgs } from "node:util";
import { connectDev } from "./lib/dev-client";
import { backupCatalogue } from "./backup-aheed-catalogue";
import { parseEnvFile } from "./lib/env-file";

const TARGET_VENDOR_ID = "a4ed0000-0000-4000-a000-000000000001";
const TARGET_VENDOR_SLUG = "aheed-food-centre";

export async function resetStockBaseline(vendorId: string, confirm: boolean) {
  const { prisma, host } = connectDev("ws");

  // 1. Verify Vendor
  const vendor = await prisma.vendor.findFirst({
    where: { OR: [{ id: vendorId }, { slug: TARGET_VENDOR_SLUG }] },
    select: { id: true, name: true, slug: true },
  });

  if (!vendor) {
    throw new Error(`Vendor not found for id/slug: ${vendorId}`);
  }

  console.log(`\n======================================================`);
  console.log(`Aheed Super Store — Official First Stock Baseline`);
  console.log(`Vendor: ${vendor.name} (${vendor.id})`);
  console.log(`======================================================\n`);

  // 2. Perform Backup First
  console.log(`[1/4] Ensuring full database & inventory backup...`);
  const backupPath = await backupCatalogue(vendor.id);
  console.log(`Backup confirmed: ${backupPath}\n`);

  // 3. Inspect Current State
  console.log(`[2/4] Inspecting current catalogue and inventory counts...`);
  const productCount = await prisma.product.count({ where: { vendorId: vendor.id } });
  const inventoryCount = await prisma.inventory.count({ where: { vendorId: vendor.id } });
  const auditLogCount = await prisma.inventoryAuditLog.count({ where: { vendorId: vendor.id } });

  console.log(`Current state:`);
  console.log(`  - Total Products: ${productCount.toLocaleString()}`);
  console.log(`  - Total Inventory Records: ${inventoryCount.toLocaleString()}`);
  console.log(`  - Existing Inventory Audit Logs: ${auditLogCount.toLocaleString()}`);

  if (!confirm) {
    console.log(
      `\n[DRY RUN] Run with '--confirm-baseline' to apply the official stock baseline reset.`,
    );
    console.log(`  - Will delete ${auditLogCount.toLocaleString()} historical inventory logs.`);
    console.log(
      `  - Will retain all ${productCount.toLocaleString()} products and actual stock counts.`,
    );
    console.log(
      `  - Will write ${inventoryCount.toLocaleString()} official opening baseline records.`,
    );
    return {
      dryRun: true,
      backupPath,
      productCount,
      inventoryCount,
      auditLogCount,
    };
  }

  // 4. Execute Baseline Reset in Transaction
  console.log(`\n[3/4] Resetting historical inventory records in transaction...`);
  const result = await prisma.$transaction(
    async (tx) => {
      // Step A: Delete previous historical movement records
      const deleteResult = await tx.inventoryAuditLog.deleteMany({
        where: { vendorId: vendor.id },
      });

      // Step B: Fetch all inventories with product details
      const inventories = await tx.inventory.findMany({
        where: { vendorId: vendor.id },
        select: {
          id: true,
          productId: true,
          quantity: true,
          stockMode: true,
          product: {
            select: { name: true, plu: true },
          },
        },
      });

      // Step C: Write official opening baseline for each inventory item
      const now = new Date();
      const baselineRows = inventories.map((inv) => {
        const mode = inv.quantity > 0 && inv.stockMode === "UNKNOWN" ? "TRACKED" : inv.stockMode;
        return {
          vendorId: vendor.id,
          productId: inv.productId,
          inventoryId: inv.id,
          previousQuantity: 0,
          newQuantity: inv.quantity,
          changeAmount: inv.quantity,
          previousStockMode: "UNKNOWN" as const,
          newStockMode: mode,
          source: "SYSTEM_INITIAL_RESET" as const,
          reason: "First Stock Baseline - Official Opening Inventory",
          actorType: "SYSTEM",
          createdAt: now,
        };
      });

      // Insert in chunks to avoid query param limit
      const CHUNK = 500;
      for (let i = 0; i < baselineRows.length; i += CHUNK) {
        const chunk = baselineRows.slice(i, i + CHUNK);
        await tx.inventoryAuditLog.createMany({
          data: chunk,
        });
      }

      // Step D: Transition UNKNOWN to TRACKED for products with non-zero stock
      const updatedModes = await tx.inventory.updateMany({
        where: {
          vendorId: vendor.id,
          stockMode: "UNKNOWN",
          quantity: { gt: 0 },
        },
        data: {
          stockMode: "TRACKED",
        },
      });

      return {
        deletedAuditLogs: deleteResult.count,
        baselineAuditLogsCreated: baselineRows.length,
        stockModesTransitioned: updatedModes.count,
      };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  // 5. Verify Post-Baseline State
  console.log(`\n[4/4] Verifying clean opening stock baseline...`);
  const finalProductCount = await prisma.product.count({ where: { vendorId: vendor.id } });
  const finalInventoryCount = await prisma.inventory.count({ where: { vendorId: vendor.id } });
  const finalAuditCount = await prisma.inventoryAuditLog.count({ where: { vendorId: vendor.id } });

  console.log(`\nSUCCESS: Baseline successfully established.`);
  console.log(`Summary:`);
  console.log(`  - Products retained intact: ${finalProductCount.toLocaleString()}`);
  console.log(
    `  - Current stock quantities retained intact: ${finalInventoryCount.toLocaleString()}`,
  );
  console.log(
    `  - Historical movement records cleared: ${result.deletedAuditLogs.toLocaleString()}`,
  );
  console.log(`  - Opening baseline records created: ${finalAuditCount.toLocaleString()}`);
  console.log(
    `  - Unknown modes transitioned to Tracked: ${result.stockModesTransitioned.toLocaleString()}`,
  );
  console.log(`  - Permanent backup saved at: ${backupPath}\n`);

  return {
    dryRun: false,
    backupPath,
    productsRetained: finalProductCount,
    inventoriesRetained: finalInventoryCount,
    historicalCleared: result.deletedAuditLogs,
    baselineCreated: finalAuditCount,
  };
}

// CLI entry point
if (process.argv[1] && process.argv[1].includes("reset-stock-baseline")) {
  parseEnvFile(".env");

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "confirm-baseline": { type: "boolean", default: false },
      "vendor-id": { type: "string", default: TARGET_VENDOR_ID },
    },
  });

  resetStockBaseline(values["vendor-id"]!, values["confirm-baseline"]!)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Baseline reset failed:", err);
      process.exit(1);
    });
}
