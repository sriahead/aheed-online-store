import { describe, expect, it } from "vitest";
import { buildPlan } from "@/lib/catalogue-import/plan";
import { applyPlan, type ImportDb } from "@/lib/catalogue-import/apply";
import { importProfileSchema, type ImportProfile } from "@/lib/catalogue-import/profile";
import type { SourceRow } from "@/lib/catalogue-import/rows";

const TEST_PROFILE: ImportProfile = importProfileSchema.parse({
  columns: {
    plu: "PLU",
    name: "Name",
    price: "Price",
    department: "Dept",
    brand: "Brand",
    netContent: "NetContent",
  },
  unit: { pattern: "\\d+\\s?(?:g|kg|ml|l)\\b", defaultLabel: "each" },
  policy: {
    byDepartment: {},
    uncertainDepartments: [],
    unrestrictedDepartments: ["GROCERY", "DAIRY", "DRINKS"],
  },
});

function createRow(over: Partial<SourceRow> = {}): SourceRow {
  return {
    sourceRow: 1,
    plu: "1001",
    name: "Sample Product",
    description: "",
    priceRaw: "£2.50",
    department: "GROCERY",
    subDepartment: "",
    vatRaw: "0",
    brand: "",
    netContentRaw: "",
    ...over,
  };
}

describe("Excel Product Import & Data Validation Improvements", () => {
  it("imports and associates product brand names from explicit brand column", () => {
    const plan = buildPlan(
      [
        createRow({ sourceRow: 2, plu: "1001", name: "Baked Beans", brand: "Heinz" }),
        createRow({ sourceRow: 3, plu: "1002", name: "Corn Flakes", brand: "Kellogg's" }),
      ],
      TEST_PROFILE,
    );

    expect(plan.products[0].brandName).toBe("Heinz");
    expect(plan.products[1].brandName).toBe("Kellogg's");
    expect(plan.enrichedProducts[0].brandSource).toBe("COLUMN");
  });

  it("identifies brand from delimited prefix in product name when brand column is empty", () => {
    const plan = buildPlan(
      [
        createRow({ sourceRow: 2, plu: "1001", name: "TRS - Cumin Seeds 100g", brand: "" }),
        createRow({ sourceRow: 3, plu: "1002", name: "Shan | Biryani Masala 50g", brand: "" }),
        createRow({ sourceRow: 4, plu: "1003", name: "Laila : Basmati Rice 5kg", brand: "   " }),
      ],
      TEST_PROFILE,
    );

    expect(plan.products[0].brandName).toBe("TRS");
    expect(plan.products[1].brandName).toBe("Shan");
    expect(plan.products[2].brandName).toBe("Laila");
    expect(plan.enrichedProducts[0].brandSource).toBe("DELIMITED_PREFIX");
  });

  it("identifies brand from known vendor brands list with high confidence", () => {
    const profileWithKnownBrands: ImportProfile = importProfileSchema.parse({
      ...TEST_PROFILE,
      knownBrands: ["Elephant Atta", "Rubicon", "KTC", "East End"],
    });

    const plan = buildPlan(
      [
        createRow({ sourceRow: 2, plu: "1001", name: "Elephant Atta Medium Chapatti Flour 10kg" }),
        createRow({ sourceRow: 3, plu: "1002", name: "Rubicon Sparkling Mango 330ml" }),
        createRow({ sourceRow: 4, plu: "1003", name: "KTC Pure Sunflower Oil 5L" }),
      ],
      profileWithKnownBrands,
    );

    expect(plan.products[0].brandName).toBe("Elephant Atta");
    expect(plan.products[1].brandName).toBe("Rubicon");
    expect(plan.products[2].brandName).toBe("KTC");
    expect(plan.enrichedProducts[0].brandSource).toBe("KNOWN_BRAND");
  });

  it("never guesses or invents brands or net content when confidence is low or vague", () => {
    const plan = buildPlan(
      [
        createRow({
          sourceRow: 2,
          plu: "1001",
          name: "Large Family Pack Fresh Red Apples",
          brand: "N/A",
          netContentRaw: "",
        }),
        createRow({
          sourceRow: 3,
          plu: "1002",
          name: "Crispy Golden Crunch Biscuits",
          brand: "Generic",
          netContentRaw: "Medium",
        }),
      ],
      TEST_PROFILE,
    );

    // Placeholder brands discarded, no random noun guessed as brand
    expect(plan.products[0].brandName).toBeUndefined();
    expect(plan.products[1].brandName).toBeUndefined();

    // Vague words ("Large", "Medium") not guessed as weights
    expect(plan.products[0].netContentAmount).toBeUndefined();
    expect(plan.products[1].netContentAmount).toBeUndefined();
  });

  it("automatically populates obvious net content from net content raw column", () => {
    const plan = buildPlan(
      [
        createRow({ sourceRow: 2, plu: "1001", name: "Flour", netContentRaw: "1.5kg" }),
        createRow({ sourceRow: 3, plu: "1002", name: "Milk", netContentRaw: "500ml" }),
      ],
      TEST_PROFILE,
    );

    expect(plan.products[0].netContentAmount).toBe(1500);
    expect(plan.products[0].netContentUnit).toBe("GRAM");
    expect(plan.products[1].netContentAmount).toBe(500);
    expect(plan.products[1].netContentUnit).toBe("MILLILITRE");
  });

  it("automatically populates obvious net content from product name when column is blank", () => {
    const plan = buildPlan(
      [
        createRow({ sourceRow: 2, plu: "1001", name: "Basmati Rice 5kg" }),
        createRow({ sourceRow: 3, plu: "1002", name: "Olive Oil 750ml" }),
        createRow({ sourceRow: 4, plu: "1003", name: "Sugar 500g" }),
        createRow({ sourceRow: 5, plu: "1004", name: "Mineral Water 2L" }),
      ],
      TEST_PROFILE,
    );

    expect(plan.products[0].netContentAmount).toBe(5);
    expect(plan.products[0].netContentUnit).toBe("KILOGRAM");

    expect(plan.products[1].netContentAmount).toBe(750);
    expect(plan.products[1].netContentUnit).toBe("MILLILITRE");

    expect(plan.products[2].netContentAmount).toBe(500);
    expect(plan.products[2].netContentUnit).toBe("GRAM");

    expect(plan.products[3].netContentAmount).toBe(2);
    expect(plan.products[3].netContentUnit).toBe("LITRE");
  });

  it("correctly parses multipacks and converts to total volume/weight in base units", () => {
    const plan = buildPlan(
      [
        createRow({ sourceRow: 2, plu: "1001", name: "Coca Cola 6 x 330ml Cans" }),
        createRow({ sourceRow: 3, plu: "1002", name: "Baked Beans 4 x 400g" }),
        createRow({ sourceRow: 4, plu: "1003", name: "Evian Water 2 x 1.5L" }),
        createRow({ sourceRow: 5, plu: "1004", name: "PG Tips 80 tea bags" }),
      ],
      TEST_PROFILE,
    );

    // 6 * 330ml = 1980ml
    expect(plan.products[0].netContentAmount).toBe(1980);
    expect(plan.products[0].netContentUnit).toBe("MILLILITRE");
    expect(plan.enrichedProducts[0].packCount).toBe(6);

    // 4 * 400g = 1600g
    expect(plan.products[1].netContentAmount).toBe(1600);
    expect(plan.products[1].netContentUnit).toBe("GRAM");
    expect(plan.enrichedProducts[1].packCount).toBe(4);

    // 2 * 1.5L = 3L
    expect(plan.products[2].netContentAmount).toBe(3);
    expect(plan.products[2].netContentUnit).toBe("LITRE");
    expect(plan.enrichedProducts[2].packCount).toBe(2);

    // 80 count
    expect(plan.products[3].netContentAmount).toBe(80);
    expect(plan.products[3].netContentUnit).toBe("EACH");
    expect(plan.enrichedProducts[3].packCount).toBe(80);
  });

  it("flags conflicting net content between column and title for manual review", () => {
    const plan = buildPlan(
      [
        createRow({
          sourceRow: 2,
          plu: "1001",
          name: "Basmati Rice 1kg",
          netContentRaw: "500g", // Conflict: column says 500g, title says 1kg
        }),
      ],
      TEST_PROFILE,
    );

    expect(plan.products[0].restriction).toBe("NEEDS_REVIEW");
    expect(plan.reviewWarnings).toHaveLength(1);
    expect(plan.reviewWarnings[0].type).toBe("NET_CONTENT_CONFLICT");
    expect(plan.reviewWarnings[0].message).toContain("Conflicting net content");
    expect(plan.enrichedProducts[0].warnings).toBeDefined();
  });

  it("flags extreme anomalous prices (> £1,000) for review", () => {
    const plan = buildPlan(
      [
        createRow({
          sourceRow: 2,
          plu: "1001",
          name: "Bulk Grocery Item",
          priceRaw: "£1,250.00",
        }),
      ],
      TEST_PROFILE,
    );

    expect(plan.products[0].restriction).toBe("NEEDS_REVIEW");
    expect(plan.reviewWarnings).toHaveLength(1);
    expect(plan.reviewWarnings[0].type).toBe("PRICE_ANOMALY");
    expect(plan.reviewWarnings[0].message).toContain("Unusually high retail price");
  });

  it("prevents duplicate products in the import file by rejecting duplicate slug rows", () => {
    const plan = buildPlan(
      [
        createRow({ sourceRow: 2, plu: "1001", name: "Basmati Rice 5kg", department: "GROCERY" }),
        createRow({ sourceRow: 3, plu: "1001", name: "Basmati Rice 5kg", department: "GROCERY" }),
      ],
      TEST_PROFILE,
    );

    expect(plan.products).toHaveLength(1);
    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0].code).toBe("DUPLICATE_ROW");
    expect(plan.rejected[0].sourceRow).toBe(3);
  });

  it("updates existing product when new reliable data is present, while preserving existing valid data when imported fields are blank", async () => {
    const createdBrands: { id: string; name: string }[] = [];
    const createdProducts: any[] = [];
    const updatedProducts: any[] = [];

    const mockDb: ImportDb = {
      category: {
        findMany: async () => [{ id: "cat-grocery", slug: "grocery" }],
      },
      product: {
        findMany: async ({ where }) => {
          const results: any[] = [];
          if (
            (where.slug && where.slug.in.includes("existing-no-brand-1kg-1001-grocery")) ||
            (where.plu && where.plu.in.includes("1001"))
          ) {
            results.push({
              id: "prod-existing-1",
              slug: "existing-no-brand-1kg-1001-grocery",
              name: "Existing No Brand",
              basePrice: 200,
              isActive: true,
              restriction: null,
              brandId: null, // Missing brand
              netContentAmount: null, // Missing net content
              netContentUnit: null,
              isManuallyEdited: false,
              manuallyEditedFields: [],
              plu: "1001",
            });
          }
          if (
            (where.slug && where.slug.in.includes("existing-has-brand-1002-grocery")) ||
            (where.plu && where.plu.in.includes("1002"))
          ) {
            results.push({
              id: "prod-existing-2",
              slug: "existing-has-brand-1002-grocery",
              name: "Existing Has Brand",
              basePrice: 300,
              isActive: true,
              restriction: null,
              brandId: "brand-existing-val", // Already has brand
              netContentAmount: 500, // Already has net content
              netContentUnit: "GRAM" as const,
              isManuallyEdited: false,
              manuallyEditedFields: [],
              plu: "1002",
            });
          }
          return results;
        },
      },
      brand: {
        findMany: async () => [
          { id: "brand-existing-val", name: "Existing Brand", slug: "existing-brand" },
        ],
      },
      $transaction: async (fn) => {
        return fn({
          category: { createMany: async () => {} },
          product: {
            createMany: async ({ data }) => {
              createdProducts.push(...data);
            },
            update: async ({ where, data }) => {
              updatedProducts.push({ id: where.id, ...data });
            },
          },
          inventory: { createMany: async () => {} },
          productRestrictionAuditLog: { createMany: async () => {} },
          brand: {
            create: async ({ data }) => {
              createdBrands.push({ id: data.id, name: data.name });
            },
          },
        });
      },
    };

    const plan = buildPlan(
      [
        // Row 1 matches prod-existing-1 (which has null brand and null net content)
        // Incoming has reliable brand "East End" and reliable net content "1kg" -> should enrich
        createRow({
          sourceRow: 2,
          plu: "1001",
          name: "Existing No Brand 1kg",
          department: "GROCERY",
          brand: "East End",
        }),
        // Row 2 matches prod-existing-2 (which already has brand and net content)
        // Incoming has BLANK brand and BLANK net content -> should preserve existing without clearing
        createRow({
          sourceRow: 3,
          plu: "1002",
          name: "Existing Has Brand",
          department: "GROCERY",
          brand: "",
          netContentRaw: "",
        }),
        // Row 3 is a brand new product
        createRow({
          sourceRow: 4,
          plu: "1003",
          name: "Brand New Oats 750g",
          department: "GROCERY",
          brand: "Quaker",
        }),
      ],
      TEST_PROFILE,
    );

    const result = await applyPlan(mockDb, "vendor-1", plan, { enrichExisting: true });

    // 1 created, 1 updated (enriched), 1 unchanged (preserved)
    expect(result.productsCreated).toBe(1);
    expect(result.productsUpdated).toBe(1);
    expect(result.existingUnchanged).toBe(1);

    // Newly created product
    expect(createdProducts).toHaveLength(1);
    expect(createdProducts[0].name).toBe("Brand New Oats 750g");

    // Enriched existing product
    expect(updatedProducts).toHaveLength(1);
    expect(updatedProducts[0].id).toBe("prod-existing-1");
    expect(updatedProducts[0].netContentAmount).toBe(1);
    expect(updatedProducts[0].netContentUnit).toBe("KILOGRAM");

    // Row 2's existing valid brand and net content were never wiped or modified
    expect(updatedProducts.some((u) => u.id === "prod-existing-2")).toBe(false);
  });

  it("preserves manually edited fields when isManuallyEdited is true", async () => {
    const updatedProducts: any[] = [];

    const mockDb: ImportDb = {
      category: { findMany: async () => [{ id: "cat-grocery", slug: "grocery" }] },
      product: {
        findMany: async () => [
          {
            id: "prod-protected-1",
            slug: "protected-product-500g-1001-grocery",
            name: "Protected Product 500g",
            basePrice: 500,
            isActive: true,
            restriction: null,
            brandId: null,
            netContentAmount: null,
            netContentUnit: null,
            isManuallyEdited: true,
            manuallyEditedFields: ["brandId"], // Store owner manually specified brandId must not be changed
            plu: "1001",
          },
        ],
      },
      brand: { findMany: async () => [] },
      $transaction: async (fn) => {
        return fn({
          category: { createMany: async () => {} },
          product: {
            createMany: async () => {},
            update: async ({ where, data }) => {
              updatedProducts.push({ id: where.id, ...data });
            },
          },
          inventory: { createMany: async () => {} },
          productRestrictionAuditLog: { createMany: async () => {} },
          brand: { create: async () => {} },
        });
      },
    };

    const plan = buildPlan(
      [
        createRow({
          sourceRow: 2,
          plu: "1001",
          name: "Protected Product 500g",
          department: "GROCERY",
          brand: "Attempted Brand Overwrite",
        }),
      ],
      TEST_PROFILE,
    );

    await applyPlan(mockDb, "vendor-1", plan, { enrichExisting: true });

    // brandId was protected by manuallyEditedFields and therefore NOT included in update
    expect(updatedProducts[0].brandId).toBeUndefined();
    // netContent was not protected so it gets enriched safely
    expect(updatedProducts[0].netContentAmount).toBe(500);
    expect(updatedProducts[0].netContentUnit).toBe("GRAM");
  });
});
