import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { identifyProductBrand } from "@/lib/catalogue-import/brand";
import { extractDetailedNetContent } from "@/lib/catalogue-import/net-content";
import { deriveUnitPricePenceForSort } from "@/components/product/unit-price";
import { evaluateHmrCvat } from "../scripts/hmrc-vat-rules";
import type { ImportManifest } from "../scripts/generate-import-manifests";

describe("Staged Catalogue Import Batch 2 (Slice 2)", () => {
  const manifestPath = path.join(".import-manifests", "aheed-batch-2.json");

  function loadBatch2Manifest(): ImportManifest {
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    }
    // CI fixture fallback when .import-manifests is gitignored
    return {
      batchId: "aheed-batch-2",
      description: "Aheed Food Centre - Batch 2 (Remaining 50% Clean Catalogue)",
      generatedAt: "2026-11-06T11:21:36.060Z",
      productCount: 5,
      products: [
        {
          sourceRow: 3112,
          plu: "8137",
          barcode: null,
          name: "MPNACO",
          department: "GROCERIES",
          group: "BISCUITS",
          sellingPricePence: 99,
          costPricePence: 100,
          taxRatePercent: 0,
          legacyExcelVat: 0,
          taxCategory: "ZERO_RATED",
          taxRule:
            "HMRC Notice 701/14 Section 2 (Group 1 Food): Human food for domestic consumption is zero-rated (0%)",
          spreadsheetStock: -9,
        },
        {
          sourceRow: 3113,
          plu: "7798",
          barcode: null,
          name: "MUNCHEE CHOCOLATE PUFF 3 PACK",
          department: "GROCERIES",
          group: "BISCUITS",
          sellingPricePence: 79,
          costPricePence: 100,
          taxRatePercent: 0,
          legacyExcelVat: 20, // Discrepancy
          taxCategory: "ZERO_RATED",
          taxRule:
            "HMRC Notice 701/14 Section 2 (Group 1 Food): Human food for domestic consumption is zero-rated (0%)",
          spreadsheetStock: 0,
        },
        {
          sourceRow: 3114,
          plu: "4488",
          barcode: null,
          name: "MUNCHEE HAWAIAN COOKIES 100G",
          department: "GROCERIES",
          group: "BISCUITS",
          sellingPricePence: 99,
          costPricePence: 100,
          taxRatePercent: 0,
          legacyExcelVat: 0,
          taxCategory: "ZERO_RATED",
          taxRule:
            "HMRC Notice 701/14 Section 2 (Group 1 Food): Human food for domestic consumption is zero-rated (0%)",
          spreadsheetStock: 0,
        },
        {
          sourceRow: 3115,
          plu: "8930",
          barcode: null,
          name: "OREO COOKIES",
          department: "GROCERIES",
          group: "BISCUITS",
          sellingPricePence: 120,
          costPricePence: 80,
          taxRatePercent: 0,
          legacyExcelVat: 0,
          taxCategory: "ZERO_RATED",
          taxRule:
            "HMRC Notice 701/14 Section 2 (Group 1 Food): Human food for domestic consumption is zero-rated (0%)",
          spreadsheetStock: 15,
        },
        {
          sourceRow: 3116,
          plu: "9001",
          barcode: null,
          name: "LUX SOAP 100G",
          department: "HOUSEHOLD",
          group: "SOAP",
          sellingPricePence: 150,
          costPricePence: 100,
          taxRatePercent: 20,
          legacyExcelVat: 0, // Discrepancy
          taxCategory: "STANDARD_RATED",
          taxRule: "Standard rate",
          spreadsheetStock: 20,
        },
      ],
    };
  }

  it("manifest has valid batchId and product entries", () => {
    const manifest = loadBatch2Manifest();
    expect(manifest.batchId).toBe("aheed-batch-2");
    expect(manifest.productCount).toBeGreaterThanOrEqual(5);
    expect(manifest.products.length).toBe(manifest.productCount);
    if (fs.existsSync(manifestPath)) {
      expect(manifest.productCount).toBe(3049);
    }
  });

  it("validates every product in batch 2 has valid PLU, name, and positive price", () => {
    const manifest = loadBatch2Manifest();

    for (const item of manifest.products) {
      expect(item.plu).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.sellingPricePence).toBeGreaterThanOrEqual(0);
      expect(item.sourceRow).toBeGreaterThanOrEqual(1);
      expect([0, 20]).toContain(item.taxRatePercent);
    }
  });

  it("identifies brands with high confidence from batch 2 product names", () => {
    const manifest = loadBatch2Manifest();

    const knownBrands = ["Munchee", "Oreo", "TRS", "Laila", "Shan", "Natco", "Maliban"];
    let identifiedCount = 0;

    for (const item of manifest.products) {
      const result = identifyProductBrand(undefined, item.name, knownBrands);
      if (result.confidence === "HIGH" && result.brandName) {
        identifiedCount++;
      }
    }

    expect(identifiedCount).toBeGreaterThanOrEqual(2);

    // Specific product test checks from batch 2
    const munchee = identifyProductBrand(undefined, "MUNCHEE HAWAIAN COOKIES 100G", knownBrands);
    expect(munchee.confidence).toBe("HIGH");
    expect(munchee.brandName?.toLowerCase()).toBe("munchee");

    const oreo = identifyProductBrand(undefined, "OREO COOKIES", knownBrands);
    expect(oreo.confidence).toBe("HIGH");
    expect(oreo.brandName?.toLowerCase()).toBe("oreo");
  });

  it("extracts net content and computes derived sort keys on batch 2 items", () => {
    const manifest = loadBatch2Manifest();

    let netContentCount = 0;
    for (const item of manifest.products) {
      const net = extractDetailedNetContent(item.name);
      if (net && net.confidence === "HIGH" && net.amount != null && net.unit != null) {
        netContentCount++;
      }
    }

    expect(netContentCount).toBeGreaterThanOrEqual(2);

    // Specific checks
    const item1 = extractDetailedNetContent("MUNCHEE HAWAIAN COOKIES 100G");
    expect(item1).not.toBeNull();
    expect(item1!.confidence).toBe("HIGH");
    expect(item1!.amount).toBe(100);
    expect(item1!.unit).toBe("GRAM");
    const sort1 = deriveUnitPricePenceForSort(99, { amount: 100, unit: "GRAM" });
    expect(sort1).toBe(990); // 99p per 100g = 990p per kg

    const item2 = extractDetailedNetContent("MUNCHEE CHOCOLATE PUFF 3 PACK");
    expect(item2).not.toBeNull();
    expect(item2!.confidence).toBe("HIGH");
    expect(item2!.amount).toBe(3);
    expect(item2!.unit).toBe("EACH");
    const sort2 = deriveUnitPricePenceForSort(79, { amount: 3, unit: "EACH" });
    expect(sort2).toBe(26); // 79p / 3 each = 26p each
  });

  it("applies HMRC VAT rules adhering to UK VAT Act 1994 Group 1 zero-rating", () => {
    const manifest = loadBatch2Manifest();

    let discrepancies = 0;
    for (const item of manifest.products) {
      const vat = evaluateHmrCvat(item.department, item.group, item.name);
      expect([0, 20]).toContain(vat.rate);
      if (item.legacyExcelVat !== vat.rate) {
        discrepancies++;
      }
    }

    expect(discrepancies).toBeGreaterThanOrEqual(1);
  });
});
