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

describe("Excel Product Import Improvements (Requirement 2)", () => {
  it("imports and associates product brand names", () => {
    const plan = buildPlan(
      [
        createRow({ sourceRow: 2, plu: "1001", name: "Baked Beans", brand: "Heinz" }),
        createRow({ sourceRow: 3, plu: "1002", name: "Corn Flakes", brand: "Kellogg's" }),
      ],
      TEST_PROFILE,
    );

    expect(plan.products[0].brandName).toBe("Heinz");
    expect(plan.products[1].brandName).toBe("Kellogg's");
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

  it("preserves existing product data when applying plan and matches existing products", async () => {
    const createdBrands: { id: string; name: string }[] = [];
    const createdProducts: any[] = [];

    const mockDb: ImportDb = {
      category: {
        findMany: async () => [{ id: "cat-grocery", slug: "grocery" }],
      },
      product: {
        findMany: async ({ where }) => {
          if (where.slug && where.slug.in.includes("existing-item-1001-grocery")) {
            return [
              {
                id: "prod-existing-1",
                slug: "existing-item-1001-grocery",
                name: "Existing Item",
                basePrice: 200,
                isActive: true,
                restriction: null,
              },
            ];
          }
          return [];
        },
      },
      brand: {
        findMany: async () => [
          { id: "brand-existing", name: "Existing Brand", slug: "existing-brand" },
        ],
      },
      $transaction: async (fn) => {
        return fn({
          category: { createMany: async () => {} },
          product: {
            createMany: async ({ data }) => {
              createdProducts.push(...data);
            },
            update: async () => {},
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
        // Existing product row - should not be re-created
        createRow({ sourceRow: 2, plu: "1001", name: "Existing Item", department: "GROCERY" }),
        // New product row with brand and net content
        createRow({
          sourceRow: 3,
          plu: "1002",
          name: "New Butter 250g",
          department: "GROCERY",
          brand: "Lurpak",
        }),
      ],
      TEST_PROFILE,
    );

    const result = await applyPlan(mockDb, "vendor-1", plan);

    expect(result.productsCreated).toBe(1);
    expect(result.existingUnchanged).toBe(1);
    expect(createdProducts).toHaveLength(1);
    expect(createdProducts[0].name).toBe("New Butter 250g");
    expect(createdProducts[0].netContentAmount).toBe(250);
    expect(createdProducts[0].netContentUnit).toBe("GRAM");
    expect(createdBrands.some((b) => b.name === "Lurpak")).toBe(true);
  });
});
