import * as fs from "node:fs";
import * as path from "node:path";
import { readSourceGrid } from "./lib/read-spreadsheet";
import { evaluateHmrCvat } from "./hmrc-vat-rules";

export interface ManifestProduct {
  sourceRow: number;
  plu: string;
  barcode: string | null;
  name: string;
  department: string;
  group: string;
  sellingPricePence: number;
  costPricePence: number | null;
  taxRatePercent: number;
  legacyExcelVat: number;
  taxCategory: "ZERO_RATED" | "STANDARD_RATED";
  taxRule: string;
  spreadsheetStock: number;
}

export interface ImportManifest {
  batchId: string;
  description: string;
  generatedAt: string;
  productCount: number;
  products: ManifestProduct[];
}

export interface QuarantineGroup {
  plu: string;
  reason: string;
  rows: ManifestProduct[];
}

export interface QuarantineManifest {
  manifestId: string;
  generatedAt: string;
  totalQuarantinedRows: number;
  duplicateGroupCount: number;
  groups: QuarantineGroup[];
}

export function parseSpreadsheet(filePath: string) {
  const { grid: rows } = readSourceGrid(filePath);

  const products: ManifestProduct[] = [];

  // Rows 5 to 6164 are product data (0-indexed: 4 to 6163)
  for (let r = 4; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const pluRaw = row[1];
    if (pluRaw === undefined || pluRaw === null || String(pluRaw).trim() === "") {
      continue;
    }

    const pluStr = String(pluRaw).trim();
    // Stop at footer or summary rows
    if (pluStr.toLowerCase().includes("total") || pluStr.toLowerCase().includes("report")) {
      continue;
    }

    const barcodeRaw = row[2];
    const barcodeStr =
      barcodeRaw !== undefined && barcodeRaw !== null && String(barcodeRaw).trim() !== ""
        ? String(barcodeRaw).trim()
        : null;

    const descRaw = row[3];
    const nameStr = descRaw ? String(descRaw).trim() : `Product ${pluStr}`;

    const stockRaw = row[4] ? parseFloat(String(row[4]).replace(/[^0-9.-]/g, "")) : 0;
    const spreadsheetStock = !isNaN(stockRaw) ? stockRaw : 0;

    const sellingPriceRaw = row[5] ? parseFloat(String(row[5]).replace(/[^0-9.]/g, "")) : 0;
    const sellingPricePence = !isNaN(sellingPriceRaw) ? Math.round(sellingPriceRaw * 100) : 0;

    const costPriceRaw = row[6] ? parseFloat(String(row[6]).replace(/[^0-9.]/g, "")) : NaN;
    const costPricePence = !isNaN(costPriceRaw) ? Math.round(costPriceRaw * 100) : null;

    const taxRaw =
      row[10] !== undefined && row[10] !== null
        ? parseFloat(String(row[10]).replace(/[^0-9.]/g, ""))
        : 0;
    const legacyExcelVat = !isNaN(taxRaw) ? taxRaw : 0;

    const deptRaw = row[11];
    const deptStr = deptRaw ? String(deptRaw).trim() : "UNCATEGORIZED";

    const groupRaw = row[12];
    const groupStr = groupRaw ? String(groupRaw).trim() : "GENERAL";

    const vatEvaluation = evaluateHmrCvat(deptStr, groupStr, nameStr);

    products.push({
      sourceRow: r + 1, // 1-indexed row number in Excel
      plu: pluStr,
      barcode: barcodeStr,
      name: nameStr,
      department: deptStr,
      group: groupStr,
      sellingPricePence,
      costPricePence,
      taxRatePercent: vatEvaluation.rate,
      legacyExcelVat,
      taxCategory: vatEvaluation.category,
      taxRule: vatEvaluation.rule,
      spreadsheetStock,
    });
  }

  return products;
}

export function generateManifests(excelPath = "docs/StockList.xls", outDir = ".import-manifests") {
  const allProducts = parseSpreadsheet(excelPath);
  console.log(`Parsed ${allProducts.length} product rows from ${excelPath}`);

  // Group by PLU to detect duplicates
  const pluMap = new Map<string, ManifestProduct[]>();
  for (const prod of allProducts) {
    const list = pluMap.get(prod.plu) || [];
    list.push(prod);
    pluMap.set(prod.plu, list);
  }

  const quarantineGroups: QuarantineGroup[] = [];
  const cleanProducts: ManifestProduct[] = [];

  for (const [plu, list] of pluMap.entries()) {
    if (list.length > 1) {
      quarantineGroups.push({
        plu,
        reason: `Duplicate PLU found across ${list.length} rows with conflicting prices/departments. Requires manual approval.`,
        rows: list,
      });
    } else {
      cleanProducts.push(list[0]);
    }
  }

  // Sort clean products by sourceRow
  cleanProducts.sort((a, b) => a.sourceRow - b.sourceRow);

  const halfIndex = Math.ceil(cleanProducts.length / 2);
  const batch1Products = cleanProducts.slice(0, halfIndex);
  const batch2Products = cleanProducts.slice(halfIndex);

  const quarantineManifest: QuarantineManifest = {
    manifestId: "aheed-quarantine-duplicates",
    generatedAt: new Date().toISOString(),
    totalQuarantinedRows: quarantineGroups.reduce((acc, g) => acc + g.rows.length, 0),
    duplicateGroupCount: quarantineGroups.length,
    groups: quarantineGroups,
  };

  const batch1Manifest: ImportManifest = {
    batchId: "aheed-batch-1",
    description: "Aheed Food Centre - Batch 1 (Initial 50% Clean Catalogue)",
    generatedAt: new Date().toISOString(),
    productCount: batch1Products.length,
    products: batch1Products,
  };

  const batch2Manifest: ImportManifest = {
    batchId: "aheed-batch-2",
    description: "Aheed Food Centre - Batch 2 (Remaining 50% Clean Catalogue)",
    generatedAt: new Date().toISOString(),
    productCount: batch2Products.length,
    products: batch2Products,
  };

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const qPath = path.join(outDir, "aheed-quarantine-duplicates.json");
  const b1Path = path.join(outDir, "aheed-batch-1.json");
  const b2Path = path.join(outDir, "aheed-batch-2.json");

  fs.writeFileSync(qPath, JSON.stringify(quarantineManifest, null, 2), "utf8");
  fs.writeFileSync(b1Path, JSON.stringify(batch1Manifest, null, 2), "utf8");
  fs.writeFileSync(b2Path, JSON.stringify(batch2Manifest, null, 2), "utf8");

  console.log("=== Manifest Generation Complete ===");
  console.log(`Total Products In Excel: ${allProducts.length}`);
  console.log(
    `Quarantined Rows:       ${quarantineManifest.totalQuarantinedRows} (${quarantineManifest.duplicateGroupCount} duplicate PLU groups)`,
  );
  console.log(`Batch 1 Clean Products:  ${batch1Manifest.productCount} (${b1Path})`);
  console.log(`Batch 2 Clean Products:  ${batch2Manifest.productCount} (${b2Path})`);
  console.log(
    `Clean Total:             ${batch1Manifest.productCount + batch2Manifest.productCount}`,
  );
  console.log(
    `Reconciled Sum:          ${cleanProducts.length + quarantineManifest.totalQuarantinedRows} === ${allProducts.length}`,
  );

  return {
    quarantineManifest,
    batch1Manifest,
    batch2Manifest,
  };
}

if (process.argv[1] && process.argv[1].endsWith("generate-import-manifests.ts")) {
  generateManifests();
}
