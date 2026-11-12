import { describe, expect, it, vi } from "vitest";
import {
  describeBulkQuantityResult,
  MAX_BULK_ROWS,
  parseBulkQuantityForm,
} from "@/lib/bulk-quantity";
import { bulkSetInventoryQuantities, listProductsForAdminPage } from "@/lib/repositories/products";

/** #1523 — bulk stock counts and the numbered staff list, with no database. */

function entries(pairs: Record<string, string>): [string, string][] {
  return Object.entries(pairs);
}

describe("parseBulkQuantityForm (#1523, R14–R16)", () => {
  it("keeps only rows whose box differs from what rendered, and is not blank", () => {
    const parsed = parseBulkQuantityForm(
      entries({
        "qty:a": "5",
        "orig:a": "3",
        "qty:b": "7",
        "orig:b": "7",
        "qty:c": "",
        "orig:c": "",
        "qty:d": "0",
        "orig:d": "",
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      updates: [
        { productId: "a", quantity: 5 },
        { productId: "d", quantity: 0 },
      ],
    });
  });

  it("rejects negative, fractional, exponent and over-limit values, and saves nothing", () => {
    for (const bad of ["-1", "1.5", "1e3", "12abc", "100001"]) {
      const parsed = parseBulkQuantityForm(entries({ "qty:a": "2", "orig:a": "1", "qty:b": bad }));
      expect(parsed.ok).toBe(false);
    }
  });

  it("accepts the maximum", () => {
    expect(parseBulkQuantityForm(entries({ "qty:a": "100000" }))).toEqual({
      ok: true,
      updates: [{ productId: "a", quantity: 100000 }],
    });
  });

  it("refuses more rows than one page holds", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i <= MAX_BULK_ROWS; i++) many[`qty:p${i}`] = "1";
    expect(parseBulkQuantityForm(entries(many)).ok).toBe(false);
  });

  it("describes a result in plain words", () => {
    expect(describeBulkQuantityResult({ updated: 2, unchanged: 0, missing: 0 })).toBe("2 updated.");
    expect(describeBulkQuantityResult({ updated: 1, unchanged: 1, missing: 1 })).toBe(
      "1 updated, 1 already at that count, 1 not found (skipped).",
    );
  });
});

describe("bulkSetInventoryQuantities (#1523, R14/R16)", () => {
  function fakeWs(
    products: {
      id: string;
      manuallyEditedFields: string[];
      inventory: { quantity: number; stockMode: string } | null;
    }[],
  ) {
    const tx = {
      product: { findMany: vi.fn(async () => products), update: vi.fn(async () => ({})) },
      inventory: { upsert: vi.fn(async () => ({ id: "inv-1" })) },
      inventoryAuditLog: { create: vi.fn(async () => ({})) },
    };
    const $transaction = vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx));
    return { client: { $transaction } as never, tx, $transaction };
  }

  it("writes changed rows in one transaction, skips unchanged and foreign ids", async () => {
    const { client, tx, $transaction } = fakeWs([
      { id: "a", manuallyEditedFields: [], inventory: { quantity: 3, stockMode: "TRACKED" } },
      { id: "b", manuallyEditedFields: [], inventory: { quantity: 7, stockMode: "TRACKED" } },
      { id: "c", manuallyEditedFields: [], inventory: { quantity: 0, stockMode: "UNTRACKED" } },
    ]);
    const result = await bulkSetInventoryQuantities(client, "vendor-1", [
      { productId: "a", quantity: 5 },
      { productId: "b", quantity: 7 },
      { productId: "c", quantity: 0 },
      { productId: "other-vendor", quantity: 9 },
    ]);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ updated: 2, unchanged: 1, missing: ["other-vendor"] });
    // Vendor-scoped read.
    expect(tx.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ vendorId: "vendor-1" }) }),
    );
    // One audit per change, TRACKED afterwards, STAFF_ADJUSTMENT.
    expect(tx.inventoryAuditLog.create).toHaveBeenCalledTimes(2);
    const audits = tx.inventoryAuditLog.create.mock.calls.map(
      (call) => (call as unknown as [{ data: Record<string, unknown> }])[0].data,
    );
    expect(audits[0]).toMatchObject({
      productId: "a",
      previousQuantity: 3,
      newQuantity: 5,
      changeAmount: 2,
      newStockMode: "TRACKED",
      source: "STAFF_ADJUSTMENT",
    });
    expect(audits[1]).toMatchObject({ productId: "c", previousStockMode: "UNTRACKED" });
  });

  it("refuses a negative or fractional quantity before opening a transaction", async () => {
    const { client, $transaction } = fakeWs([]);
    await expect(
      bulkSetInventoryQuantities(client, "v", [{ productId: "a", quantity: -1 }]),
    ).rejects.toThrow();
    await expect(
      bulkSetInventoryQuantities(client, "v", [{ productId: "a", quantity: 1.5 }]),
    ).rejects.toThrow();
    expect($transaction).not.toHaveBeenCalled();
  });
});

describe("listProductsForAdminPage (#1523, R8/R9/R11/R12)", () => {
  function fakeDb(total: number) {
    const product = {
      count: vi.fn(async () => total),
      findMany: vi.fn(async () => []),
    };
    return { client: { product } as never, product };
  }
  const base = { page: 1, perPage: 25, sort: "newest" as const };

  it("clamps a page beyond the end to the last page and skips accordingly", async () => {
    const { client, product } = fakeDb(60);
    const result = await listProductsForAdminPage(client, "v", { ...base, page: 99 });
    expect(result).toMatchObject({ page: 3, pageCount: 3, total: 60 });
    expect(product.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 25 }));
  });

  it("reports page 1 of 1 for an empty list", async () => {
    const { client } = fakeDb(0);
    expect(await listProductsForAdminPage(client, "v", base)).toMatchObject({
      page: 1,
      pageCount: 1,
      total: 0,
    });
  });

  it("caps the page size at 100", async () => {
    const { client, product } = fakeDb(1000);
    await listProductsForAdminPage(client, "v", { ...base, perPage: 5000 });
    expect(product.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it("searches name, PLU and barcode, nested under AND", async () => {
    const { client, product } = fakeDb(1);
    await listProductsForAdminPage(client, "v", { ...base, search: "12670" });
    const where = (
      product.count.mock.calls[0] as unknown as [{ where: Record<string, unknown> }]
    )[0].where;
    expect(where.OR).toBeUndefined();
    expect(JSON.stringify(where.AND)).toContain('"plu"');
    expect(JSON.stringify(where.AND)).toContain('"barcode"');
    expect(JSON.stringify(where.AND)).toContain('"name"');
  });

  it("keeps the existing order by default and sorts by price on request", async () => {
    const { client, product } = fakeDb(1);
    await listProductsForAdminPage(client, "v", base);
    await listProductsForAdminPage(client, "v", { ...base, sort: "price-asc" });
    const orders = product.findMany.mock.calls.map(
      (call) => (call as unknown as [{ orderBy: unknown }])[0].orderBy,
    );
    expect(orders[0]).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(orders[1]).toEqual([{ basePrice: "asc" }, { name: "asc" }, { id: "asc" }]);
  });

  it("builds each needs-attention filter, composed with the other filters", async () => {
    const { client, product } = fakeDb(1);
    await listProductsForAdminPage(client, "v", { ...base, needs: "price" });
    await listProductsForAdminPage(client, "v", {
      ...base,
      needs: "ready",
      restriction: "NEEDS_REVIEW",
    });
    await listProductsForAdminPage(client, "v", { ...base, needs: "image" });
    const wheres = product.count.mock.calls.map(
      (call) => (call as unknown as [{ where: Record<string, unknown> }])[0].where,
    );
    expect(wheres[0]).toMatchObject({ vendorId: "v", basePrice: { lte: 0 } });
    // `restriction` appears in both fragments, so they are ANDed, not overwritten.
    expect(JSON.stringify(wheres[1])).toContain('"NEEDS_REVIEW"');
    expect(JSON.stringify(wheres[1])).toContain('"restriction":null');
    expect(wheres[2]).toMatchObject({ images: { none: {} } });
  });
});
