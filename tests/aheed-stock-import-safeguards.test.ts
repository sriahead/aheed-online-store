import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { quickUpdateInventory } from "@/lib/repositories/products";
import { purchasableQuantity } from "@/lib/cart-rules";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

describe.skipIf(!connectionString)("Aheed Stock Management & Import Safeguards", () => {
  let prisma: PrismaClient;
  const TEST_VENDOR_1 = "a4ed0000-0000-4000-a000-000000000001"; // Aheed Food Centre
  const TEST_VENDOR_2 = "5217a4a7-0000-4000-a000-000000000002"; // SriMart
  const FIXTURE_PREFIX = "test-safeguard-";

  let testCatId1: string;
  let testCatId2: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaNeon({ connectionString: connectionString! }),
    });
    // Find or create test categories
    const cat1 = await prisma.category.findFirst({ where: { vendorId: TEST_VENDOR_1 } });
    if (!cat1) throw new Error("No category for Aheed");
    testCatId1 = cat1.id;

    const cat2 = await prisma.category.findFirst({ where: { vendorId: TEST_VENDOR_2 } });
    if (!cat2) {
      const created = await prisma.category.create({
        data: {
          vendorId: TEST_VENDOR_2,
          name: "Test Electronics",
          slug: "test-electronics-safeguard",
        },
      });
      testCatId2 = created.id;
    } else {
      testCatId2 = cat2.id;
    }

    // Clean up any old test fixtures
    await prisma.inventoryAuditLog.deleteMany({
      where: { product: { slug: { startsWith: FIXTURE_PREFIX } } },
    });
    await prisma.inventory.deleteMany({
      where: { product: { slug: { startsWith: FIXTURE_PREFIX } } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: FIXTURE_PREFIX } },
    });
  });

  afterAll(async () => {
    if (prisma) {
      // Clean up test fixtures
      await prisma.inventoryAuditLog.deleteMany({
        where: { product: { slug: { startsWith: FIXTURE_PREFIX } } },
      });
      await prisma.inventory.deleteMany({
        where: { product: { slug: { startsWith: FIXTURE_PREFIX } } },
      });
      await prisma.product.deleteMany({
        where: { slug: { startsWith: FIXTURE_PREFIX } },
      });
      await prisma.$disconnect();
    }
  });

  it("1. PLU uniqueness per vendor and multi-tenant isolation", async () => {
    const testPlu = "999888";

    // Create product under Aheed with testPlu
    const p1 = await prisma.product.create({
      data: {
        vendorId: TEST_VENDOR_1,
        categoryId: testCatId1,
        name: "Test PLU Product Aheed",
        slug: `${FIXTURE_PREFIX}plu-aheed`,
        description: "Test description",
        basePrice: 500,
        unitLabel: "£5.00",
        plu: testPlu,
        isActive: false,
      },
    });
    expect(p1.id).toBeDefined();

    // Duplicate PLU under SAME vendor must fail
    await expect(
      prisma.product.create({
        data: {
          vendorId: TEST_VENDOR_1,
          categoryId: testCatId1,
          name: "Test PLU Duplicate",
          slug: `${FIXTURE_PREFIX}plu-aheed-dup`,
          description: "Test description",
          basePrice: 600,
          unitLabel: "£6.00",
          plu: testPlu,
          isActive: false,
        },
      }),
    ).rejects.toThrow();

    // SAME PLU under DIFFERENT vendor (SriMart) must SUCCEED (tenant isolation)
    const p2 = await prisma.product.create({
      data: {
        vendorId: TEST_VENDOR_2,
        categoryId: testCatId2,
        name: "Test PLU Product SriMart",
        slug: `${FIXTURE_PREFIX}plu-srimart`,
        description: "Test description",
        basePrice: 750,
        unitLabel: "£7.50",
        plu: testPlu,
        isActive: false,
      },
    });
    expect(p2.id).toBeDefined();
    expect(p2.vendorId).toBe(TEST_VENDOR_2);
  });

  it("2. Stock rules: Count of 0 transitions UNKNOWN to TRACKED", async () => {
    const p = await prisma.product.create({
      data: {
        vendorId: TEST_VENDOR_1,
        categoryId: testCatId1,
        name: "Test Stock Transition Product",
        slug: `${FIXTURE_PREFIX}stock-transition`,
        description: "Test description",
        basePrice: 350,
        unitLabel: "£3.50",
        plu: "999887",
        isActive: false,
        inventory: {
          create: {
            vendorId: TEST_VENDOR_1,
            quantity: 0,
            stockMode: "UNKNOWN",
          },
        },
      },
      include: { inventory: true },
    });

    expect(p.inventory?.stockMode).toBe("UNKNOWN");
    expect(p.inventory?.quantity).toBe(0);

    // Purchasable quantity must be 0 when stockMode is UNKNOWN
    const purchasableBefore = purchasableQuantity(p.inventory as any);
    expect(purchasableBefore).toBe(0);

    // Attempting to activate product while UNKNOWN must be refused
    const activateAttempt = await quickUpdateInventory(prisma as any, TEST_VENDOR_1, p.id, {
      isActive: true,
    });
    expect(activateAttempt.ok).toBe(false);
    expect((activateAttempt as any).error).toMatch(
      /cannot be activated while stock status is UNKNOWN/i,
    );

    // Staff performs physical count and enters 0
    const countResult = await quickUpdateInventory(prisma as any, TEST_VENDOR_1, p.id, {
      quantity: 0,
    });
    expect(countResult.ok).toBe(true);

    // Check inventory: stockMode is now TRACKED with quantity 0
    const invAfter = await prisma.inventory.findUnique({
      where: { productId: p.id },
    });
    expect(invAfter?.stockMode).toBe("TRACKED");
    expect(invAfter?.quantity).toBe(0);

    // Now product can be activated because stock is verified (even though out of stock)
    const activateAfter = await quickUpdateInventory(prisma as any, TEST_VENDOR_1, p.id, {
      isActive: true,
    });
    expect(activateAfter.ok).toBe(true);

    // But customer still cannot buy it because quantity is 0
    const purchasableAfter = purchasableQuantity(invAfter as any);
    expect(purchasableAfter).toBe(0);

    // Verify InventoryAuditLog was written
    const auditLogs = await prisma.inventoryAuditLog.findMany({
      where: { productId: p.id },
      orderBy: { createdAt: "asc" },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    const lastAudit = auditLogs[auditLogs.length - 1];
    expect(lastAudit.source).toBe("STAFF_ADJUSTMENT");
    expect(lastAudit.previousStockMode).toBe("UNKNOWN");
    expect(lastAudit.newStockMode).toBe("TRACKED");
  });

  it("3. Manual edit protection: Batch 2 cannot overwrite staff changes even if reverted", async () => {
    // Simulate a product created from Batch 1
    const p = await prisma.product.create({
      data: {
        vendorId: TEST_VENDOR_1,
        categoryId: testCatId1,
        name: "Original Spreadsheet Name",
        slug: `${FIXTURE_PREFIX}manual-protection`,
        description: "Original Description",
        basePrice: 199,
        unitLabel: "£1.99",
        plu: "999886",
        isActive: false,
        importBatchId: "aheed-batch-1",
        importSourceRow: 100,
        isManuallyEdited: false,
        manuallyEditedFields: [],
        inventory: {
          create: {
            vendorId: TEST_VENDOR_1,
            quantity: 0,
            stockMode: "UNKNOWN",
          },
        },
      },
    });

    // Staff edits name and price
    const editedName = "Handcrafted Gourmet Samosa (3pk)";
    const editedPrice = 249;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: editedName,
        basePrice: editedPrice,
        isManuallyEdited: true,
        manuallyEditedFields: ["name", "basePrice"],
        lastManualEditAt: new Date(),
      },
    });

    // Staff later changes price back to £1.99 (reverted value, but still manually touched!)
    await prisma.product.update({
      where: { id: p.id },
      data: {
        basePrice: 199,
        lastManualEditAt: new Date(),
      },
    });

    // Simulate Batch 2 incoming data with conflicting spreadsheet values
    const incomingSpreadsheetName = "Excel Overwrite Attempt";
    const incomingSpreadsheetPrice = 299;

    const existingProduct = await prisma.product.findUnique({
      where: { id: p.id },
    });
    expect(existingProduct?.isManuallyEdited).toBe(true);

    const protectedFields = new Set(existingProduct?.manuallyEditedFields || []);
    const updates: any = {};

    if (!protectedFields.has("name")) {
      updates.name = incomingSpreadsheetName;
    }
    if (!protectedFields.has("basePrice")) {
      updates.basePrice = incomingSpreadsheetPrice;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.product.update({
        where: { id: p.id },
        data: updates,
      });
    }

    // Verify that neither name nor basePrice was overwritten by Excel
    const productAfter = await prisma.product.findUnique({
      where: { id: p.id },
    });
    expect(productAfter?.name).toBe(editedName);
    expect(productAfter?.basePrice).toBe(199); // preserved staff value
  });

  it("4. Rollback safety: Preserves products with orders, physical stock, or manual edits", async () => {
    // 1. Clean product with UNKNOWN stock (safe to rollback)
    const cleanProd = await prisma.product.create({
      data: {
        vendorId: TEST_VENDOR_1,
        categoryId: testCatId1,
        name: "Clean Rollback Product",
        slug: `${FIXTURE_PREFIX}clean-rollback`,
        description: "Test description",
        basePrice: 100,
        unitLabel: "£1.00",
        plu: "999885",
        importBatchId: "test-rollback-batch",
        inventory: {
          create: {
            vendorId: TEST_VENDOR_1,
            quantity: 0,
            stockMode: "UNKNOWN",
          },
        },
      },
    });

    // 2. Product with physical stock (must be PRESERVED)
    const stockProd = await prisma.product.create({
      data: {
        vendorId: TEST_VENDOR_1,
        categoryId: testCatId1,
        name: "Stock Protected Product",
        slug: `${FIXTURE_PREFIX}stock-protected`,
        description: "Test description",
        basePrice: 200,
        unitLabel: "£2.00",
        plu: "999884",
        importBatchId: "test-rollback-batch",
        inventory: {
          create: {
            vendorId: TEST_VENDOR_1,
            quantity: 15,
            stockMode: "TRACKED",
          },
        },
      },
    });

    // 3. Product with staff manual edits (must be PRESERVED)
    const manualProd = await prisma.product.create({
      data: {
        vendorId: TEST_VENDOR_1,
        categoryId: testCatId1,
        name: "Staff Edited Product",
        slug: `${FIXTURE_PREFIX}staff-edited`,
        description: "Test description",
        basePrice: 300,
        unitLabel: "£3.00",
        plu: "999883",
        importBatchId: "test-rollback-batch",
        isManuallyEdited: true,
        manuallyEditedFields: ["name"],
        inventory: {
          create: {
            vendorId: TEST_VENDOR_1,
            quantity: 0,
            stockMode: "UNKNOWN",
          },
        },
      },
    });

    // Execute rollback logic for "test-rollback-batch"
    const batchProducts = await prisma.product.findMany({
      where: { vendorId: TEST_VENDOR_1, importBatchId: "test-rollback-batch" },
      include: { inventory: true, _count: { select: { orderItems: true } } },
    });

    const toDelete: string[] = [];
    const preserved: string[] = [];

    for (const p of batchProducts) {
      if (
        p._count.orderItems === 0 &&
        !p.isManuallyEdited &&
        p.inventory?.stockMode === "UNKNOWN" &&
        p.inventory?.quantity === 0
      ) {
        toDelete.push(p.id);
      } else {
        preserved.push(p.id);
      }
    }

    expect(toDelete).toEqual([cleanProd.id]);
    expect(preserved).toContain(stockProd.id);
    expect(preserved).toContain(manualProd.id);
  });

  it("5. VAT Validation & Audit Trail: Discrepancies are flagged for client review and auditable", async () => {
    // 1. Create a product with a VAT discrepancy (Stella Beer: spreadsheet says 0%, HMRC says 20%)
    const p = await prisma.product.create({
      data: {
        vendorId: TEST_VENDOR_1,
        categoryId: testCatId1,
        name: "Stella Beer 660ml",
        slug: `${FIXTURE_PREFIX}vat-beer`,
        description: "Alcoholic beverage",
        basePrice: 400,
        unitLabel: "£4.00",
        plu: "999882",
        originalVatRate: 0,
        suggestedVatRate: 20,
        vatRate: 20,
        vatNeedsReview: true,
        vatReviewReason:
          "Spreadsheet listed 0% VAT. Suggested 20% based on HMRC Notice 700 (Alcohol). Client confirmation required.",
      },
    });

    expect(p.vatNeedsReview).toBe(true);
    expect(p.originalVatRate).toBe(0);
    expect(p.suggestedVatRate).toBe(20);
    expect(p.vatReviewReason).toContain("Client confirmation required");

    // 2. Client confirms the 20% VAT rate
    const { confirmProductVat } = await import("@/lib/repositories/products");
    const confirmResult = await confirmProductVat(
      prisma as any,
      TEST_VENDOR_1,
      p.id,
      20,
      "client-store-owner",
    );
    expect(confirmResult.ok).toBe(true);

    // Verify product state after client confirmation
    const pAfter = await prisma.product.findUnique({ where: { id: p.id } });
    expect(pAfter?.vatNeedsReview).toBe(false);
    expect(pAfter?.vatRate).toBe(20);
    expect(pAfter?.vatConfirmedBy).toBe("client-store-owner");
    expect(pAfter?.vatConfirmedAt).not.toBeNull();
    expect(pAfter?.isManuallyEdited).toBe(true);
    expect(pAfter?.manuallyEditedFields).toContain("vatRate");
  });
});
