import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import type { ImportManifest, ManifestProduct } from "./generate-import-manifests";
import { parseEnvFile } from "./lib/env-file";
import { identifyProductBrand } from "../lib/catalogue-import/brand";
import { extractDetailedNetContent } from "../lib/catalogue-import/net-content";
import { deriveUnitPricePenceForSort, type NetContentUnit } from "../components/product/unit-price";

function resolveConnectionString(): string {
  const envFlagIndex = process.argv.indexOf("--env-file");
  if (envFlagIndex !== -1 && process.argv[envFlagIndex + 1]) {
    const envVars = parseEnvFile(process.argv[envFlagIndex + 1]);
    const conn = envVars.DIRECT_URL || envVars.DATABASE_URL;
    if (conn) return conn;
  }
  return process.env.DIRECT_URL || process.env.DATABASE_URL || "";
}

let defaultPrisma: PrismaClient | null = null;
function getDefaultPrisma(): PrismaClient {
  if (!defaultPrisma) {
    const connectionString = resolveConnectionString();
    if (!connectionString) {
      throw new Error("Neither DIRECT_URL nor DATABASE_URL is set in environment or env-file.");
    }
    defaultPrisma = new PrismaClient({
      adapter: new PrismaNeon({ connectionString }),
    });
  }
  return defaultPrisma;
}

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
  prisma?: PrismaClient;
}

export async function importBatch(options: ImportBatchOptions) {
  const { manifestPath, vendorId, apply = false, prisma: injectedPrisma } = options;
  const db = injectedPrisma ?? getDefaultPrisma();

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest: ImportManifest = JSON.parse(raw);

  const vendor = await db.vendor.findUnique({
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
    brandsEnriched: 0,
    netContentEnriched: 0,
    vatDiscrepanciesFlagged: 0,
    skippedRows: 0,
    errors: [] as string[],
  };

  // Pre-load existing categories and brands for this vendor
  const categories = await db.category.findMany({
    where: { vendorId },
    select: { id: true, slug: true, name: true },
  });
  const categoryMap = new Map<string, string>(); // deptName.toLowerCase() -> categoryId
  for (const c of categories) {
    categoryMap.set(c.name.toLowerCase(), c.id);
  }

  const existingBrands = await db.brand.findMany({
    where: { vendorId },
    select: { id: true, slug: true, name: true },
  });
  const brandMap = new Map<string, string>(); // brandName.toLowerCase() -> brandId
  for (const b of existingBrands) {
    brandMap.set(b.name.toLowerCase(), b.id);
  }

  // Helpers to get or create category and brand
  async function getOrCreateCategory(deptName: string): Promise<string> {
    const key = deptName.trim().toLowerCase();
    const existing = categoryMap.get(key);
    if (existing) return existing;

    const baseSlug = slugify(deptName) || "general";
    let catSlug = baseSlug;
    let counter = 1;
    while (
      await db.category.findUnique({ where: { vendorId_slug: { vendorId, slug: catSlug } } })
    ) {
      catSlug = `${baseSlug}-${counter++}`;
    }

    const newCat = await db.category.create({
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

  async function getOrCreateBrand(brandName: string): Promise<string> {
    const key = brandName.trim().toLowerCase();
    const existing = brandMap.get(key);
    if (existing) return existing;

    const baseSlug = slugify(brandName) || `brand-${Date.now().toString(36)}`;
    let brandSlug = baseSlug;
    let counter = 1;
    while (await db.brand.findUnique({ where: { vendorId_slug: { vendorId, slug: brandSlug } } })) {
      brandSlug = `${baseSlug}-${counter++}`;
    }

    const newBrand = await db.brand.create({
      data: {
        vendorId,
        name: brandName.trim(),
        slug: brandSlug,
      },
    });
    brandMap.set(key, newBrand.id);
    return newBrand.id;
  }

  if (!apply) {
    // Quick dry-run check against database
    const existingPlus = await db.product.findMany({
      where: {
        vendorId,
        plu: { in: manifest.products.map((p) => p.plu) },
      },
      select: {
        plu: true,
        brandId: true,
        netContentAmount: true,
        netContentUnit: true,
        vatRate: true,
        isManuallyEdited: true,
        manuallyEditedFields: true,
      },
    });

    const existingPluMap = new Map(existingPlus.map((p) => [p.plu, p]));
    const manualEditCount = existingPlus.filter((p) => p.isManuallyEdited).length;

    let wouldEnrichBrand = 0;
    let wouldEnrichNetContent = 0;
    let wouldFlagVat = 0;

    for (const item of manifest.products) {
      const existing = existingPluMap.get(item.plu);
      const edited = new Set(existing?.manuallyEditedFields || []);

      if (item.legacyExcelVat !== item.taxRatePercent) {
        if (!edited.has("vatRate")) {
          wouldFlagVat++;
        }
      }

      const brandCandidate = identifyProductBrand(
        undefined,
        item.name,
        Array.from(brandMap.keys()),
      );
      if (brandCandidate.confidence === "HIGH" && brandCandidate.brandName) {
        if (!existing || (!existing.brandId && !edited.has("brandId"))) {
          wouldEnrichBrand++;
        }
      }

      const netContentCandidate = extractDetailedNetContent(item.name);
      if (
        netContentCandidate &&
        netContentCandidate.confidence === "HIGH" &&
        netContentCandidate.amount != null &&
        netContentCandidate.unit != null
      ) {
        if (
          !existing ||
          ((!existing.netContentAmount || !existing.netContentUnit) &&
            !edited.has("netContentAmount"))
        ) {
          wouldEnrichNetContent++;
        }
      }
    }

    report.existingProductsUpdated = existingPlus.length;
    report.newProductsCreated = manifest.products.length - existingPlus.length;
    report.manuallyProtectedFieldsPreserved = manualEditCount;
    report.stockValuesPreserved = existingPlus.length;
    report.brandsEnriched = wouldEnrichBrand;
    report.netContentEnriched = wouldEnrichNetContent;
    report.vatDiscrepanciesFlagged = wouldFlagVat;

    console.log(`\n[DRY RUN SUMMARY]`);
    console.log(`- New products that would be created:        ${report.newProductsCreated}`);
    console.log(`- Existing products that would be matched:   ${report.existingProductsUpdated}`);
    console.log(`- Brands that will be enriched:              ${report.brandsEnriched}`);
    console.log(`- Net content that will be enriched:         ${report.netContentEnriched}`);
    console.log(`- VAT discrepancies that will be flagged:    ${report.vatDiscrepanciesFlagged}`);
    console.log(`- Products with manual edit protection:      ${manualEditCount}`);
    console.log(`- Existing stock records that remain untouched: ${report.stockValuesPreserved}`);
    return report;
  }

  // APPLY MODE: Process products in concurrency-controlled chunks
  const CHUNK_SIZE = 25;
  for (let i = 0; i < manifest.products.length; i += CHUNK_SIZE) {
    const chunk = manifest.products.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (item) => {
        try {
          const categoryId = await getOrCreateCategory(item.department);

          // Brand identification
          const brandCandidate = identifyProductBrand(
            undefined,
            item.name,
            Array.from(brandMap.keys()),
          );
          let brandId: string | null = null;
          if (brandCandidate.confidence === "HIGH" && brandCandidate.brandName) {
            brandId = await getOrCreateBrand(brandCandidate.brandName);
          }

          // Net content extraction
          const netContentCandidate = extractDetailedNetContent(item.name);
          let netContentAmount: number | null = null;
          let netContentUnit: NetContentUnit | null = null;
          let unitPriceSort: number | null = null;

          if (
            netContentCandidate &&
            netContentCandidate.confidence === "HIGH" &&
            netContentCandidate.amount != null &&
            netContentCandidate.unit != null
          ) {
            netContentAmount = netContentCandidate.amount;
            netContentUnit = netContentCandidate.unit;
            unitPriceSort = deriveUnitPricePenceForSort(item.sellingPricePence, {
              amount: netContentAmount,
              unit: netContentUnit,
            });
          }

          // Check if product with this PLU exists under this vendor
          const existingProduct = await db.product.findUnique({
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
            const baseSlug = slugify(item.name) || `prod-${item.plu}`;
            const uniqueSlug = `${baseSlug}-${item.plu}`;

            const createdProduct = await db.product.create({
              data: {
                vendorId,
                categoryId,
                brandId,
                netContentAmount,
                netContentUnit,
                unitPricePencePerBaseUnit: unitPriceSort,
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

            if (brandId) report.brandsEnriched++;
            if (netContentAmount != null) report.netContentEnriched++;
            if (item.legacyExcelVat !== item.taxRatePercent) {
              report.vatDiscrepanciesFlagged++;
            }

            // Create inventory row with stockMode UNKNOWN and quantity 0
            const inv = await db.inventory.create({
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
            await db.inventoryAuditLog.create({
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
            const updates: Record<string, unknown> = {};

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

            // Brand enrichment: only update if product does not currently have a brand
            if (!editedFields.has("brandId")) {
              if (brandId && !existingProduct.brandId) {
                updates.brandId = brandId;
                report.brandsEnriched++;
              }
            } else {
              report.manuallyProtectedFieldsPreserved++;
            }

            // Net content enrichment: only update if product lacks net content
            if (!editedFields.has("netContentAmount") && !editedFields.has("netContentUnit")) {
              if (
                netContentAmount != null &&
                netContentUnit != null &&
                (!existingProduct.netContentAmount || !existingProduct.netContentUnit)
              ) {
                updates.netContentAmount = netContentAmount;
                updates.netContentUnit = netContentUnit;
                updates.unitPricePencePerBaseUnit = unitPriceSort;
                report.netContentEnriched++;
              }
            } else {
              report.manuallyProtectedFieldsPreserved++;
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

            // Always update lineage to this batch and source row
            updates.importBatchId = manifest.batchId;
            updates.importSourceRow = item.sourceRow;

            if (Object.keys(updates).length > 0) {
              await db.product.update({
                where: { id: existingProduct.id },
                data: updates,
              });
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          report.errors.push(`Row ${item.sourceRow} (PLU ${item.plu}): ${msg}`);
        }
      }),
    );
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
  console.log(`Brands Enriched:             ${report.brandsEnriched}`);
  console.log(`Net Content Enriched:        ${report.netContentEnriched}`);
  console.log(`VAT Discrepancies Flagged:   ${report.vatDiscrepanciesFlagged}`);
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
      "Usage: npx tsx scripts/import-catalogue-batch.ts <manifest.json> [--vendor-id <id>] [--apply] [--env-file <path>]",
    );
    process.exit(1);
  }

  importBatch({ manifestPath: manifestArg, vendorId, apply })
    .catch((err) => {
      console.error("Import failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      if (defaultPrisma) {
        await defaultPrisma.$disconnect();
      }
    });
}
