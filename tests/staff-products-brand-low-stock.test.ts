import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND_ALL,
  BRAND_NONE,
  NEEDS_FILTERS,
  SORT_OPTIONS,
  parseStaffProductsQuery,
  staffProductsHref,
} from "@/lib/staff-products-query";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  isLowStock,
  lowStockSavedMessage,
  parseLowStockThreshold,
} from "@/lib/low-stock";

/** #1572 — brand filter and sort, the low-stock rule, and the store-wide default. */

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const brands = [{ id: "brand-a" }, { id: "brand-b" }];

describe("brand filter (R1, R12)", () => {
  it("defaults to all brands and writes nothing to the URL", () => {
    const q = parseStaffProductsQuery({}, [], brands);
    expect(q.brand).toBe(BRAND_ALL);
    expect(q.brandId).toBeUndefined();
    expect(staffProductsHref(q)).toBe("/staff/products");
  });

  it("'none' filters to products with no brand", () => {
    const q = parseStaffProductsQuery({ brand: "none" }, [], brands);
    expect(q.brand).toBe(BRAND_NONE);
    expect(q.brandId).toBeNull();
    expect(staffProductsHref(q)).toBe("/staff/products?brand=none");
  });

  it("accepts this store's brand id and round-trips it through pagination", () => {
    const q = parseStaffProductsQuery({ brand: "brand-b" }, [], brands);
    expect(q.brandId).toBe("brand-b");
    expect(staffProductsHref(q, 3)).toBe("/staff/products?brand=brand-b&page=3");
  });

  it("ignores a brand id that is not this store's", () => {
    const q = parseStaffProductsQuery({ brand: "someone-elses" }, [], brands);
    expect(q.brand).toBe(BRAND_ALL);
    expect(q.brandId).toBeUndefined();
  });

  it("with no brand list, an id is no filter but 'none' still works", () => {
    expect(parseStaffProductsQuery({ brand: "brand-a" }, []).brandId).toBeUndefined();
    expect(parseStaffProductsQuery({ brand: "none" }, []).brandId).toBeNull();
  });
});

describe("brand sort and low-stock quick view (R2, R4)", () => {
  it("offers a brand sort and a low-stock quick view", () => {
    expect(SORT_OPTIONS).toContain("brand");
    expect(NEEDS_FILTERS).toContain("low");
    const q = parseStaffProductsQuery({ sort: "brand", needs: "low" }, [], brands);
    expect(staffProductsHref(q)).toBe("/staff/products?sort=brand&needs=low");
  });

  it("sorts unbranded products last, then by name", () => {
    const repo = read("lib/repositories/products.ts");
    expect(repo).toContain(
      'if (sort === "brand") return [{ brand: { name: "asc" } }, { name: "asc" }, { id: "asc" }];',
    );
  });

  it("filters low stock in the database with a field reference, tracked and above zero", () => {
    const repo = read("lib/repositories/products.ts");
    expect(repo).toContain(
      'inventory: { stockMode: "TRACKED", quantity: { gt: 0, lte: lowStockThreshold() } }',
    );
    expect(repo).toContain("prisma.inventory.fields.lowStockThreshold");
  });
});

describe("isLowStock (R3)", () => {
  const tracked = (quantity: number, lowStockThreshold = 3) =>
    isLowStock({ stockMode: "TRACKED", quantity, lowStockThreshold });

  it("is low from 1 up to and including the threshold", () => {
    expect(tracked(1)).toBe(true);
    expect(tracked(3)).toBe(true);
    expect(tracked(4)).toBe(false);
  });

  it("zero is out of stock, not low", () => {
    expect(tracked(0)).toBe(false);
  });

  it("untracked and unknown stock is never low", () => {
    expect(isLowStock({ stockMode: "UNTRACKED", quantity: 1, lowStockThreshold: 3 })).toBe(false);
    expect(isLowStock({ stockMode: "UNKNOWN", quantity: 1, lowStockThreshold: 3 })).toBe(false);
  });

  it("a threshold of 0 switches the label off", () => {
    expect(tracked(1, 0)).toBe(false);
  });
});

describe("store-wide default (R7–R9)", () => {
  it("defaults to 3 in the schema and the code", () => {
    expect(DEFAULT_LOW_STOCK_THRESHOLD).toBe(3);
    expect(read("prisma/schema.prisma")).toMatch(
      /lowStockThreshold\s+Int\s+@default\(3\)\n\s+bookingWindowDays/,
    );
  });

  it("accepts whole numbers 0–999 only", () => {
    expect(parseLowStockThreshold("5")).toEqual({ ok: true, value: 5 });
    expect(parseLowStockThreshold(" 0 ")).toEqual({ ok: true, value: 0 });
    for (const bad of ["", "-1", "1.5", "1000", "abc", null]) {
      expect(parseLowStockThreshold(bad).ok).toBe(false);
    }
  });

  it("says how many products moved", () => {
    expect(lowStockSavedMessage(3, 5, 12)).toBe(
      "Saved. The default is now 5; 12 products moved from 3 to 5.",
    );
    expect(lowStockSavedMessage(3, 5, 1)).toContain("1 product moved");
    expect(lowStockSavedMessage(5, 5, 0)).toBe("No change: the default is already 5.");
  });

  it("moves only products on the old default, in one WebSocket transaction", () => {
    const repo = read("lib/repositories/vendor.ts");
    expect(repo).toContain("prismaWs.$transaction");
    expect(repo).toContain("where: { vendorId, lowStockThreshold: previous }");
  });

  it("the save action is store-admin only", () => {
    const actions = read("features/admin/catalogue.ts");
    const body = actions.slice(actions.indexOf("export async function saveLowStockDefaultAction"));
    expect(body).toContain('requireVendorRole("ADMIN")');
  });
});

describe("products page (R5, R6, R8)", () => {
  const page = read("app/(admin)/staff/products/page.tsx");

  it("shows the Low stock label, the threshold and the unit price", () => {
    expect(page).toContain("Low stock");
    expect(page).toContain("Low at ${product.lowStockThreshold}");
    expect(page).toContain("deriveUnitPriceLabel(");
  });

  it("renders the default form for store admins only", () => {
    expect(page).toContain('const isStoreAdmin = auth.via !== "STAFF";');
    expect(page).toContain("<LowStockDefaultForm current={lowStockDefault} />");
  });

  it("passes the brand filter to the repository", () => {
    expect(page).toContain("brandId: query.brandId");
    expect(page).toContain('name="brand"');
  });
});

describe("every stock-record create path uses the store default (R10, R11)", () => {
  it.each([
    "lib/repositories/products.ts",
    "lib/repositories/product-restrictions.ts",
    "lib/catalogue-import/apply.ts",
    "scripts/stock-import.ts",
  ])("%s reads the store default and has no literal 3", (path) => {
    const source = read(path);
    expect(source).not.toMatch(/lowStockThreshold: 3\b/);
    expect(source).toContain("readLowStockDefault(");
  });

  it("the inventory page falls back to the schema default, not 5", () => {
    expect(read("lib/repositories/products.ts")).not.toContain("lowStockThreshold ?? 5");
  });

  it("a new product starts at the store default", () => {
    expect(read("app/(admin)/staff/products/new/page.tsx")).toContain(
      "defaultLowStockThreshold={lowStockDefault}",
    );
    expect(read("components/staff/ProductForm.tsx")).toContain(
      "product?.lowStockThreshold ?? defaultLowStockThreshold",
    );
  });
});
