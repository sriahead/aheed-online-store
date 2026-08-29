import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn() }));

const { upsertReview, deleteReview } = await import("@/lib/repositories/reviews");

describe("reviews.ts", () => {
  let created: any[] = [];
  let updated: any[] = [];
  let deleted: any[] = [];
  let txHistory: any[] = [];

  beforeEach(() => {
    created = [];
    updated = [];
    deleted = [];
    txHistory = [];
  });

  function fakePrisma() {
    const tx = {
      product: {
        findFirst: async (args: any) => {
          txHistory.push({ type: "product.findFirst", args });
          if (args.where.id === "product-1" && args.where.vendorId === "vendor-A") {
            return { vendorId: "vendor-A" };
          }
          return null;
        },
        update: async (args: any) => {
          txHistory.push({ type: "product.update", args });
          updated.push(args);
        },
      },
      review: {
        findFirst: async (args: any) => {
          txHistory.push({ type: "review.findFirst", args });
          if (args.where.vendorId === "vendor-A" && args.where.id === "review-1") {
            return { productId: "product-1" };
          }
          return null;
        },
        upsert: async (args: any) => {
          txHistory.push({ type: "review.upsert", args });
          created.push(args);
        },
        deleteMany: async (args: any) => {
          txHistory.push({ type: "review.deleteMany", args });
          deleted.push(args);
          return { count: 1 };
        },
        aggregate: async (args: any) => {
          txHistory.push({ type: "review.aggregate", args });
          return { _avg: { rating: 5 }, _count: 1 };
        },
      },
    };
    return {
      $transaction: async (fn: (tx: any) => Promise<any>) => fn(tx),
    } as any;
  }

  it("upsertReview passes and correctly tests that cross-vendor writes fail", async () => {
    const db = fakePrisma();

    // Cross-vendor: productId does not belong to vendor-B
    await expect(upsertReview(db, "vendor-B", "user-1", "product-1", 5, "Great")).rejects.toThrow(
      "Product not found",
    );

    // Correct vendor: productId belongs to vendor-A
    await upsertReview(db, "vendor-A", "user-1", "product-1", 5, "Great");

    expect(created.length).toBe(1);
    expect(created[0].create.vendorId).toBe("vendor-A");

    const findCalls = txHistory.filter((c) => c.type === "product.findFirst");
    expect(findCalls.length).toBe(2);
    expect(findCalls[1].args.where).toEqual({ id: "product-1", vendorId: "vendor-A" });
  });

  it("deleteReview passes and correctly tests that cross-vendor deletes fail", async () => {
    const db = fakePrisma();

    // Cross-vendor: product won't be found
    await deleteReview(db, "vendor-B", "review-1", "user-1");
    expect(deleted.length).toBe(0);

    await deleteReview(db, "vendor-A", "review-1", "user-1");
    expect(deleted.length).toBe(1);
    expect(deleted[0].where).toEqual({ id: "review-1", userId: "user-1", vendorId: "vendor-A" });
  });
});
