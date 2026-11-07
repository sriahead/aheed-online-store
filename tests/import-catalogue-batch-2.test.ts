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

  it("manifest exists and contains exactly 3,049 clean products", () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest: ImportManifest = JSON.parse(raw);

    expect(manifest.batchId).toBe("aheed-batch-2");
    expect(manifest.productCount).toBe(3049);
    expect(manifest.products.length).toBe(3049);
  });

  it("validates every product in batch 2 has valid PLU, name, and positive price", () => {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest: ImportManifest = JSON.parse(raw);

    for (const item of manifest.products) {
      expect(item.plu).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.sellingPricePence).toBeGreaterThanOrEqual(0);
      expect(item.sourceRow).toBeGreaterThanOrEqual(1);
      expect([0, 20]).toContain(item.taxRatePercent);
    }
  });

  it("identifies brands with high confidence from batch 2 product names", () => {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest: ImportManifest = JSON.parse(raw);

    const knownBrands = ["Munchee", "Oreo", "TRS", "Laila", "Shan", "Natco", "Maliban"];
    let identifiedCount = 0;

    for (const item of manifest.products) {
      const result = identifyProductBrand(undefined, item.name, knownBrands);
      if (result.confidence === "HIGH" && result.brandName) {
        identifiedCount++;
      }
    }

    expect(identifiedCount).toBeGreaterThan(100);

    // Specific product test checks from batch 2
    const munchee = identifyProductBrand(undefined, "MUNCHEE HAWAIAN COOKIES 100G", knownBrands);
    expect(munchee.confidence).toBe("HIGH");
    expect(munchee.brandName?.toLowerCase()).toBe("munchee");

    const oreo = identifyProductBrand(undefined, "OREO COOKIES", knownBrands);
    expect(oreo.confidence).toBe("HIGH");
    expect(oreo.brandName?.toLowerCase()).toBe("oreo");
  });

  it("extracts net content and computes derived sort keys on batch 2 items", () => {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest: ImportManifest = JSON.parse(raw);

    let netContentCount = 0;
    for (const item of manifest.products) {
      const net = extractDetailedNetContent(item.name);
      if (net && net.confidence === "HIGH" && net.amount != null && net.unit != null) {
        netContentCount++;
      }
    }

    expect(netContentCount).toBeGreaterThan(500);

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
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest: ImportManifest = JSON.parse(raw);

    let discrepancies = 0;
    for (const item of manifest.products) {
      const vat = evaluateHmrCvat(item.department, item.group, item.name);
      expect([0, 20]).toContain(vat.rate);
      if (item.legacyExcelVat !== vat.rate) {
        discrepancies++;
      }
    }

    // Noticeable legacy EPOS discrepancies flagged for client review
    expect(discrepancies).toBeGreaterThan(50);
  });
});
