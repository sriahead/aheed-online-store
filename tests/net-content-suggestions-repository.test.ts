import { describe, expect, it, vi } from "vitest";
import {
  listPendingNetContentSuggestions,
  rejectNetContentSuggestion,
  reviewNetContentSuggestion,
} from "@/lib/repositories/net-content-suggestions";
import { toggleProductImageConfirmedPhoto } from "@/lib/repositories/products";
import { parseNetContentFields } from "@/lib/catalogue-form";

/**
 * #900 — the review writes (R8, R18-R21) against in-memory fakes of the Prisma client.
 *
 * The fakes answer `findFirst` by honouring the `vendorId` in `where`, so "another vendor's row"
 * is exercised the way the real query scopes it. The compare-and-set `updateMany` calls return a
 * count the test controls, which is how a race is simulated. A real-database run of the same
 * paths is validation.md's R30.
 */

type Suggestion = {
  id: string;
  vendorId: string;
  status: string;
  amount: number | null;
  unit: string | null;
  product: { id: string; basePrice: number; netContentAmount: number | null };
};

function fakeDb(rows: Suggestion[], counts: { product?: number; suggestion?: number } = {}) {
  const productUpdateMany = vi.fn(async (_args: any) => ({ count: counts.product ?? 1 }));
  const suggestionUpdateMany = vi.fn(async (_args: any) => ({ count: counts.suggestion ?? 1 }));
  const suggestionUpdate = vi.fn(async (_args: any) => ({}));
  const findFirst = vi.fn(async ({ where }: { where: { id: string; vendorId: string } }) => {
    const row = rows.find((r) => r.id === where.id && r.vendorId === where.vendorId);
    return row ? { ...row, productId: row.product.id } : null;
  });
  const tx = {
    netContentSuggestion: { findFirst, updateMany: suggestionUpdateMany, update: suggestionUpdate },
    product: { updateMany: productUpdateMany },
  };
  const db = { ...tx, $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  return { db: db as any, productUpdateMany, suggestionUpdateMany, suggestionUpdate };
}

const pending: Suggestion = {
  id: "s1",
  vendorId: "aheed",
  status: "PENDING",
  amount: 500,
  unit: "GRAM",
  product: { id: "p1", basePrice: 349, netContentAmount: null },
};

describe("reviewNetContentSuggestion — accept (R19)", () => {
  it("writes the suggestion and its derived sort key to the product, then settles the row", async () => {
    const { db, productUpdateMany, suggestionUpdateMany } = fakeDb([pending]);
    const result = await reviewNetContentSuggestion(db, "aheed", "s1", "u1", { kind: "accept" });

    expect(result).toEqual({ ok: true, productId: "p1", status: "ACCEPTED" });
    expect(productUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1", vendorId: "aheed", netContentAmount: null },
      data: { netContentAmount: 500, netContentUnit: "GRAM", unitPricePencePerBaseUnit: 698 },
    });
    expect(suggestionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1", vendorId: "aheed", status: "PENDING" },
        data: expect.objectContaining({
          status: "ACCEPTED",
          finalAmount: 500,
          finalUnit: "GRAM",
          reviewedByUserId: "u1",
        }),
      }),
    );
  });

  it("refuses another vendor's suggestion with no write", async () => {
    const { db, productUpdateMany } = fakeDb([pending]);
    const result = await reviewNetContentSuggestion(db, "srimart", "s1", "u1", { kind: "accept" });
    expect(result.ok).toBe(false);
    expect(productUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a suggestion already reviewed", async () => {
    const { db, productUpdateMany } = fakeDb([{ ...pending, status: "ACCEPTED" }]);
    const result = await reviewNetContentSuggestion(db, "aheed", "s1", "u1", { kind: "accept" });
    expect(result).toEqual({ ok: false, error: "That suggestion has already been reviewed." });
    expect(productUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses when the product already has net content", async () => {
    const { db, productUpdateMany } = fakeDb([
      { ...pending, product: { ...pending.product, netContentAmount: 250 } },
    ]);
    const result = await reviewNetContentSuggestion(db, "aheed", "s1", "u1", { kind: "accept" });
    expect(result.ok).toBe(false);
    expect(productUpdateMany).not.toHaveBeenCalled();
  });

  it("rolls back when someone set the product's net content in between (compare-and-set)", async () => {
    const { db, suggestionUpdateMany } = fakeDb([pending], { product: 0 });
    const result = await reviewNetContentSuggestion(db, "aheed", "s1", "u1", { kind: "accept" });
    expect(result.ok).toBe(false);
    expect(suggestionUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a double click that raced it to settling the row", async () => {
    const { db } = fakeDb([pending], { suggestion: 0 });
    const result = await reviewNetContentSuggestion(db, "aheed", "s1", "u1", { kind: "accept" });
    expect(result).toEqual({ ok: false, error: "That suggestion has already been reviewed." });
  });
});

describe("reviewNetContentSuggestion — edit (R20)", () => {
  it("writes the staff values and records EDITED", async () => {
    const { db, productUpdateMany } = fakeDb([pending]);
    const result = await reviewNetContentSuggestion(db, "aheed", "s1", "u1", {
      kind: "edit",
      amount: 1,
      unit: "KILOGRAM",
    });
    expect(result).toEqual({ ok: true, productId: "p1", status: "EDITED" });
    expect(productUpdateMany.mock.calls[0][0].data).toEqual({
      netContentAmount: 1,
      netContentUnit: "KILOGRAM",
      unitPricePencePerBaseUnit: 349,
    });
  });

  it("records ACCEPTED when the staff values equal the suggestion", async () => {
    const { db } = fakeDb([pending]);
    const result = await reviewNetContentSuggestion(db, "aheed", "s1", "u1", {
      kind: "edit",
      amount: 500,
      unit: "GRAM",
    });
    expect(result).toMatchObject({ ok: true, status: "ACCEPTED" });
  });

  it("validates edited values with the product form's own rules", () => {
    for (const amount of ["0", "1.5", "-2", "abc"]) {
      expect(parseNetContentFields({ netContentAmount: amount, netContentUnit: "GRAM" }).ok).toBe(
        false,
      );
    }
    expect(parseNetContentFields({ netContentAmount: "500", netContentUnit: "OUNCE" }).ok).toBe(
      false,
    );
    expect(parseNetContentFields({ netContentAmount: "500", netContentUnit: "GRAM" })).toEqual({
      ok: true,
      value: { netContentAmount: 500, netContentUnit: "GRAM" },
    });
  });
});

describe("rejectNetContentSuggestion (R21)", () => {
  it("records the decision and never touches the product", async () => {
    const { db, suggestionUpdate, productUpdateMany } = fakeDb([pending]);
    const result = await rejectNetContentSuggestion(db, "aheed", "s1", "u1");
    expect(result).toEqual({ ok: true, productId: "p1", status: "REJECTED" });
    expect(suggestionUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ status: "REJECTED", reviewedByUserId: "u1" }),
    });
    expect(productUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a second reject, and another vendor's row", async () => {
    const already = fakeDb([{ ...pending, status: "REJECTED" }]);
    expect((await rejectNetContentSuggestion(already.db, "aheed", "s1", "u1")).ok).toBe(false);
    expect(already.suggestionUpdate).not.toHaveBeenCalled();

    const other = fakeDb([pending]);
    expect((await rejectNetContentSuggestion(other.db, "srimart", "s1", "u1")).ok).toBe(false);
    expect(other.suggestionUpdate).not.toHaveBeenCalled();
  });
});

describe("listPendingNetContentSuggestions (R18)", () => {
  it("queries only the caller's vendor's PENDING rows", async () => {
    const findMany = vi.fn(async (_args: any) => []);
    await listPendingNetContentSuggestions({ netContentSuggestion: { findMany } } as any, "aheed");
    expect(findMany.mock.calls[0][0].where).toEqual({ vendorId: "aheed", status: "PENDING" });
  });
});

describe("toggleProductImageConfirmedPhoto (R8)", () => {
  function imageDb(image: { id: string; source: string } | null) {
    const findFirst = vi.fn(async (_args: any) => image);
    const update = vi.fn(async (_args: any) => ({}));
    return { db: { productImage: { findFirst, update } } as any, findFirst, update };
  }

  it("scopes the lookup to the caller's vendor", async () => {
    const { db, findFirst } = imageDb(null);
    const result = await toggleProductImageConfirmedPhoto(db, "aheed", "p1", "i1");
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: "i1",
      productId: "p1",
      product: { vendorId: "aheed" },
    });
    expect(result.ok).toBe(false);
  });

  it("confirms an UNKNOWN image and unconfirms a confirmed one", async () => {
    const unknown = imageDb({ id: "i1", source: "UNKNOWN" });
    expect(await toggleProductImageConfirmedPhoto(unknown.db, "aheed", "p1", "i1")).toEqual({
      ok: true,
      source: "STAFF_CONFIRMED_PHOTO",
    });
    expect(unknown.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { source: "STAFF_CONFIRMED_PHOTO" },
    });

    const confirmed = imageDb({ id: "i1", source: "STAFF_CONFIRMED_PHOTO" });
    expect(await toggleProductImageConfirmedPhoto(confirmed.db, "aheed", "p1", "i1")).toEqual({
      ok: true,
      source: "UNKNOWN",
    });
  });

  it("refuses an AI-generated image with no write", async () => {
    const { db, update } = imageDb({ id: "i1", source: "AI_GENERATED" });
    expect((await toggleProductImageConfirmedPhoto(db, "aheed", "p1", "i1")).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
