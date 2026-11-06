import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import type { ImportManifest, ManifestProduct } from "./generate-import-manifests";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Neither DIRECT_URL nor DATABASE_URL is set in environment.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ImportBatchOptions {
  manifestPath: string;
  vendorId: string;
  apply?: boolean;
}

export async function importBatch(options: ImportBatchOptions) {
  const { manifestPath, vendorId, apply = false } = options;

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest: ImportManifest = JSON.parse(raw);

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, slug: true, name: true },
  });

  if (!vendor) {
    throw new Error(`Vendor ${vendorId} not found.`);
  }

  console.log("=== BATCH CATALOGUE IMPORT ===");
  console.log(`Manifest:    ${manifest.batchId} (${manifest.products.length} products)`);
  console.log(`Vendor:      ${vendor.name} (${vendor.id})`);
  console.log(`Mode:        ${apply ? "APPLY (writing to database)" : "DRY RUN (preview only)"}`);

  const report = {
    batchId: manifest.batchId,
    timestamp: new Date().toISOString(),
    vendorId,
    mode: apply ? "APPLIED" : "DRY_RUN",
    totalManifestProducts: manifest.products.length,
    newProductsCreated: 0,
    existingProductsUpdated: 0,
    manuallyProtectedFieldsPreserved: 0,
    stockValuesPreserved: 0,
    vatDiscrepanciesFlagged: 0,
    skippedRows: 0,
    errors: [] as string[],
  };

  if (!apply) {
    // Quick dry-run check against database
    const existingPlus = await prisma.product.findMany({
      where: {
        vendorId,
        plu: { in: manifest.products.map((p) => p.plu) },
      },
      select: { plu: true, isManuallyEdited: true, manuallyEditedFields: true },
    });

    const existingPluSet = new Set(existingPlus.map((p) => p.plu));
    const manualEditCount = existingPlus.filter((p) => p.isManuallyEdited).length;

    report.existingProductsUpdated = existingPlus.length;
    report.newProductsCreated = manifest.products.length - existingPlus.length;
    report.manuallyProtectedFieldsPreserved = manualEditCount;
    report.stockValuesPreserved = existingPlus.length;

    console.log(`\n[DRY RUN SUMMARY]`);
    console.log(`- New products that would be created:        ${report.newProductsCreated}`);
    console.log(`- Existing products that would be matched:   ${report.existingProductsUpdated}`);
    console.log(`- Products with manual edit protection:      ${manualEditCount}`);
    console.log(`- Existing stock records that remain untouched: ${report.stockValuesPreserved}`);
    return report;
  }

  // Pre-load existing categories for this vendor
  const categories = await prisma.category.findMany({
    where: { vendorId },
    select: { id: true, slug: true, name: true },
  });
  const categoryMap = new Map<string, string>(); // deptName -> categoryId
  for (const c of categories) {
    categoryMap.set(c.name.toLowerCase(), c.id);
  }

  // Helper to ensure category exists
  async function getOrCreateCategory(deptName: string): Promise<string> {
    const key = deptName.trim().toLowerCase();
    const existing = categoryMap.get(key);
    if (existing) return existing;

    const baseSlug = slugify(deptName) || "general";
    let catSlug = baseSlug;
    let counter = 1;
    while (
      await prisma.category.findUnique({ where: { vendorId_slug: { vendorId, slug: catSlug } } })
    ) {
      catSlug = `${baseSlug}-${counter++}`;
    }

    const newCat = await prisma.category.create({
      data: {
        vendorId,
        name: deptName.trim(),
        slug: catSlug,
        sortOrder: 0,
      },
    });
    categoryMap.set(key, newCat.id);
    return newCat.id;
  }

  for (const item of manifest.products) {
    try {
      const categoryId = await getOrCreateCategory(item.department);

      // Check if product with this PLU exists under this vendor
      const existingProduct = await prisma.product.findUnique({
        where: {
          vendorId_plu: {
            vendorId,
            plu: item.plu,
          },
        },
        include: {
          inventory: true,
        },
      });

      if (!existingProduct) {
        // Create new product
        // Generate unique slug
        const baseSlug = slugify(item.name) || `prod-${item.plu}`;
        const uniqueSlug = `${baseSlug}-${item.plu}`;

        const createdProduct = await prisma.product.create({
          data: {
            vendorId,
            categoryId,
            plu: item.plu,
            barcode: item.barcode,
            name: item.name,
            slug: uniqueSlug,
            description: `${item.name} (${item.department} - ${item.group})`,
            basePrice: item.sellingPricePence,
            unitLabel: `£${(item.sellingPricePence / 100).toFixed(2)}`,
            isActive: false, // New products start inactive
            importBatchId: manifest.batchId,
            importSourceRow: item.sourceRow,
            isManuallyEdited: false,
            manuallyEditedFields: [],
            vatRate: item.taxRatePercent,
            originalVatRate: item.legacyExcelVat,
            suggestedVatRate: item.taxRatePercent,
            vatNeedsReview: item.legacyExcelVat !== item.taxRatePercent,
            vatReviewReason:
              item.legacyExcelVat !== item.taxRatePercent
                ? `Spreadsheet listed ${item.legacyExcelVat}% VAT. Suggested ${item.taxRatePercent}% based on ${item.taxRule}. Client confirmation required.`
                : null,
          },
        });

        if (item.legacyExcelVat !== item.taxRatePercent) {
          report.vatDiscrepanciesFlagged++;
        }

        // Create inventory row with stockMode UNKNOWN and quantity 0
        const inv = await prisma.inventory.create({
          data: {
            vendorId,
            productId: createdProduct.id,
            quantity: 0, // NEVER import spreadsheet stock directly
            stockMode: "UNKNOWN",
            lowStockThreshold: 3,
            version: 0,
          },
        });

        // Audit log for initial inventory creation
        await prisma.inventoryAuditLog.create({
          data: {
            vendorId,
            productId: createdProduct.id,
            inventoryId: inv.id,
            previousQuantity: 0,
            newQuantity: 0,
            changeAmount: 0,
            previousStockMode: "UNKNOWN",
            newStockMode: "UNKNOWN",
            source: "EXCEL_IMPORT",
            batchId: manifest.batchId,
            reason: `Initial catalogue ingestion from ${manifest.batchId} (row ${item.sourceRow})`,
            actorType: "SYSTEM",
          },
        });

        report.newProductsCreated++;
      } else {
        // Product already exists: apply manual edit protection
        report.existingProductsUpdated++;
        report.stockValuesPreserved++;

        const editedFields = new Set(existingProduct.manuallyEditedFields || []);
        const updates: any = {};

        if (!editedFields.has("name")) {
          updates.name = item.name;
        } else {
          report.manuallyProtectedFieldsPreserved++;
        }

        if (!editedFields.has("basePrice")) {
          updates.basePrice = item.sellingPricePence;
        } else {
          report.manuallyProtectedFieldsPreserved++;
        }

        if (!editedFields.has("unitLabel")) {
          updates.unitLabel = `£${(item.sellingPricePence / 100).toFixed(2)}`;
        }

        if (!editedFields.has("categoryId")) {
          updates.categoryId = categoryId;
        }

        if (!editedFields.has("vatRate")) {
          const hasVatDiscrepancy = item.legacyExcelVat !== item.taxRatePercent;
          updates.vatRate = item.taxRatePercent;
          updates.originalVatRate = item.legacyExcelVat;
          updates.suggestedVatRate = item.taxRatePercent;
          updates.vatNeedsReview = hasVatDiscrepancy;
          updates.vatReviewReason = hasVatDiscrepancy
            ? `Spreadsheet listed ${item.legacyExcelVat}% VAT. Suggested ${item.taxRatePercent}% based on ${item.taxRule}. Client confirmation required.`
            : null;
          if (hasVatDiscrepancy) {
            report.vatDiscrepanciesFlagged++;
          }
        } else {
          report.manuallyProtectedFieldsPreserved++;
        }

        if (item.barcode && !existingProduct.barcode) {
          updates.barcode = item.barcode;
        }

        // Always update import lineage if not set
        if (!existingProduct.importBatchId) {
          updates.importBatchId = manifest.batchId;
          updates.importSourceRow = item.sourceRow;
        }

        if (Object.keys(updates).length > 0) {
          await prisma.product.update({
            where: { id: existingProduct.id },
            data: updates,
          });
        }
      }
    } catch (err: any) {
      report.errors.push(`Row ${item.sourceRow} (PLU ${item.plu}): ${err.message}`);
    }
  }

  // Write report to .import-reports/
  const reportDir = ".import-reports";
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const reportPath = path.join(
    reportDir,
    `report-${manifest.batchId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=== IMPORT COMPLETE ===");
  console.log(`Report written to:           ${reportPath}`);
  console.log(`New Products Created:        ${report.newProductsCreated}`);
  console.log(`Existing Products Updated:   ${report.existingProductsUpdated}`);
  console.log(`Protected Fields Preserved:  ${report.manuallyProtectedFieldsPreserved}`);
  console.log(`Stock Quantities Preserved:  ${report.stockValuesPreserved}`);
  console.log(`Errors Encountered:          ${report.errors.length}`);

  return report;
}

if (process.argv[1] && process.argv[1].endsWith("import-catalogue-batch.ts")) {
  const manifestFlagIndex = process.argv.indexOf("--manifest");
  const manifestArg =
    manifestFlagIndex !== -1
      ? process.argv[manifestFlagIndex + 1]
      : process.argv[2] && !process.argv[2].startsWith("--")
        ? process.argv[2]
        : undefined;
  const vendorArgIndex = process.argv.indexOf("--vendor-id");
  const vendorId =
    vendorArgIndex !== -1
      ? process.argv[vendorArgIndex + 1]
      : "a4ed0000-0000-4000-a000-000000000001";
  const apply = process.argv.includes("--apply");

  if (!manifestArg) {
    console.error(
      "Usage: npx tsx scripts/import-catalogue-batch.ts <manifest.json> [--vendor-id <id>] [--apply]",
    );
    process.exit(1);
  }

  importBatch({ manifestPath: manifestArg, vendorId, apply })
    .catch((err) => {
      console.error("Import failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
