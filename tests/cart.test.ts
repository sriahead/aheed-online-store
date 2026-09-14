import { describe, it, expect } from "vitest";
import {
  assertSingleIdentity,
  clampQuantity,
  effectiveStock,
  fulfilmentProgress,
  isMergePending,
  isMergeResolution,
  resolveMerge,
  type MergeLine,
} from "@/lib/cart-rules";

// lib/cart-rules.ts is deliberately pure — no lib/db import — so unlike
// tests/tenant.test.ts this needs no @prisma/client/wasm mocking.

const stock = (map: Record<string, number>) => (id: string) => map[id] ?? 0;

describe("effectiveStock", () => {
  it("treats a missing Inventory row as OUT OF STOCK, never unlimited", () => {
    expect(effectiveStock(null)).toBe(0);
    expect(effectiveStock(undefined)).toBe(0);
  });

  it("passes through a real quantity and floors negatives at 0", () => {
    expect(effectiveStock(7)).toBe(7);
    expect(effectiveStock(0)).toBe(0);
    expect(effectiveStock(-3)).toBe(0);
  });
});

describe("clampQuantity", () => {
  it("increments on re-add", () => {
    expect(clampQuantity(2, 1, 10)).toBe(3);
  });

  it("caps at available stock", () => {
    expect(clampQuantity(4, 5, 5)).toBe(5);
    expect(clampQuantity(0, 99, 3)).toBe(3);
  });

  it("never lands below 1 — removal is a separate, explicit path", () => {
    expect(clampQuantity(1, -1, 10)).toBe(1);
    expect(clampQuantity(1, -99, 10)).toBe(1);
  });

  it("returns 0 when there is no stock at all", () => {
    expect(clampQuantity(0, 1, 0)).toBe(0);
  });
});

describe("isMergePending", () => {
  it("is pending only when BOTH carts hold items", () => {
    expect(isMergePending(2, 3)).toBe(true);
  });

  it("is not pending when there is nothing to decide", () => {
    expect(isMergePending(0, 3)).toBe(false); // saved empty -> adopt guest
    expect(isMergePending(2, 0)).toBe(false); // guest empty -> nothing to do
    expect(isMergePending(0, 0)).toBe(false);
  });
});

describe("resolveMerge", () => {
  const saved: MergeLine[] = [
    { productId: "milk", quantity: 3 },
    { productId: "lentils", quantity: 1 },
  ];
  const guest: MergeLine[] = [
    { productId: "milk", quantity: 2 },
    { productId: "rice", quantity: 1 },
  ];
  const stocks = stock({ milk: 10, lentils: 10, rice: 10 });

  it("COMBINE sums quantities per product and carries guest-only items across", () => {
    const result = resolveMerge("COMBINE", saved, guest, stocks);
    expect(result).toEqual(
      expect.arrayContaining([
        { productId: "milk", quantity: 5 },
        { productId: "lentils", quantity: 1 },
        { productId: "rice", quantity: 1 },
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it("COMBINE caps each summed line at that product's stock", () => {
    const result = resolveMerge("COMBINE", saved, guest, stock({ milk: 4, lentils: 10, rice: 10 }));
    expect(result.find((l) => l.productId === "milk")).toEqual({ productId: "milk", quantity: 4 });
  });

  it("COMBINE drops a line whose product is now out of stock", () => {
    const result = resolveMerge("COMBINE", saved, guest, stock({ milk: 0, lentils: 5, rice: 5 }));
    expect(result.find((l) => l.productId === "milk")).toBeUndefined();
  });

  it("KEEP_SAVED discards the guest items", () => {
    expect(resolveMerge("KEEP_SAVED", saved, guest, stocks)).toEqual(saved);
  });

  it("KEEP_NEW discards the saved cart", () => {
    expect(resolveMerge("KEEP_NEW", saved, guest, stocks)).toEqual(guest);
  });

  it("is deterministic — the same inputs always produce the same lines", () => {
    for (const resolution of ["COMBINE", "KEEP_SAVED", "KEEP_NEW"] as const) {
      expect(resolveMerge(resolution, saved, guest, stocks)).toEqual(
        resolveMerge(resolution, saved, guest, stocks),
      );
    }
  });

  // Idempotency is a property of APPLYING a resolution, and it comes from two
  // places: this function is pure, and CartRepository.applyMerge early-returns
  // once the guest cart is gone. That guard is what matters — re-feeding an
  // already-merged cart back in with an empty guest side is not a state the
  // repository can produce, and for KEEP_NEW it would (correctly) yield nothing,
  // since "keep only the new items" is meaningless with no new items.
  it("COMBINE re-applied over an empty guest side leaves the merged cart alone", () => {
    const once = resolveMerge("COMBINE", saved, guest, stocks);
    expect(resolveMerge("COMBINE", once, [], stocks)).toEqual(once);
  });

  it("KEEP_SAVED re-applied over an empty guest side leaves the cart alone", () => {
    const once = resolveMerge("KEEP_SAVED", saved, guest, stocks);
    expect(resolveMerge("KEEP_SAVED", once, [], stocks)).toEqual(once);
  });
});

describe("isMergeResolution", () => {
  it("accepts only the three known resolutions", () => {
    expect(isMergeResolution("COMBINE")).toBe(true);
    expect(isMergeResolution("KEEP_SAVED")).toBe(true);
    expect(isMergeResolution("KEEP_NEW")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isMergeResolution("DELETE_EVERYTHING")).toBe(false);
    expect(isMergeResolution("")).toBe(false);
    expect(isMergeResolution(undefined)).toBe(false);
    expect(isMergeResolution(42)).toBe(false);
  });
});

describe("assertSingleIdentity", () => {
  it("accepts exactly one identity", () => {
    expect(() => assertSingleIdentity("user-1", null)).not.toThrow();
    expect(() => assertSingleIdentity(null, "guest-token")).not.toThrow();
  });

  it("rejects both or neither", () => {
    expect(() => assertSingleIdentity("user-1", "guest-token")).toThrow(/exactly one/);
    expect(() => assertSingleIdentity(null, null)).toThrow(/exactly one/);
  });
});

describe("fulfilmentProgress", () => {
  // Aheed's real staging figures, so a regression here is a regression a shopper
  // would actually see: £15 minimum, £30 free-delivery threshold.
  const aheed = { minimumOrderPence: 1500, freeDeliveryThresholdPence: 3000 };

  it("reports the shortfall to the minimum under DELIVERY", () => {
    expect(fulfilmentProgress(500, { method: "DELIVERY", ...aheed })).toEqual({
      kind: "below-minimum",
      remainingPence: 1000,
      percent: 33,
    });
  });

  it("reports the SAME shortfall under COLLECTION — the minimum is method-independent", () => {
    // The rule placeOrder enforces makes no distinction between the two, so
    // neither may the banner. This pairing is the requirement (R6).
    const delivery = fulfilmentProgress(500, { method: "DELIVERY", ...aheed });
    const collection = fulfilmentProgress(500, { method: "COLLECTION", ...aheed });
    expect(collection).toEqual(delivery);
    expect(collection.kind).toBe("below-minimum");
  });

  it("moves to free-delivery progress once the minimum is met", () => {
    expect(fulfilmentProgress(1800, { method: "DELIVERY", ...aheed })).toEqual({
      kind: "delivery-remaining",
      remainingPence: 1200,
      percent: 60,
    });
  });

  it("unlocks free delivery at and above the threshold", () => {
    expect(fulfilmentProgress(3000, { method: "DELIVERY", ...aheed })).toEqual({
      kind: "delivery-unlocked",
    });
    expect(fulfilmentProgress(9999, { method: "DELIVERY", ...aheed })).toEqual({
      kind: "delivery-unlocked",
    });
  });

  it("never advertises free delivery on a COLLECTION order, even far above the threshold", () => {
    // The defect this slice exists to fix: the drawer said "You unlocked FREE
    // Local Delivery" on a Click & Collect cart. There is no fee to waive.
    expect(fulfilmentProgress(9999, { method: "COLLECTION", ...aheed })).toEqual({
      kind: "collection-ready",
    });
  });

  it("says nothing when the vendor sets no minimum and offers no free delivery", () => {
    const bare = { minimumOrderPence: 0, freeDeliveryThresholdPence: null };
    expect(fulfilmentProgress(1000, { method: "DELIVERY", ...bare })).toEqual({ kind: "none" });
    expect(fulfilmentProgress(1000, { method: "COLLECTION", ...bare })).toEqual({ kind: "none" });
  });

  it("treats a zero threshold as no free-delivery offer", () => {
    expect(
      fulfilmentProgress(1000, {
        method: "DELIVERY",
        minimumOrderPence: 0,
        freeDeliveryThresholdPence: 0,
      }),
    ).toEqual({ kind: "none" });
  });

  it("uses each vendor's own figures — no shared constant", () => {
    // SriMart: £10 minimum, £50 free delivery.
    const srimart = { minimumOrderPence: 1000, freeDeliveryThresholdPence: 5000 };
    expect(fulfilmentProgress(4000, { method: "DELIVERY", ...aheed })).toEqual({
      kind: "delivery-unlocked",
    });
    expect(fulfilmentProgress(4000, { method: "DELIVERY", ...srimart })).toEqual({
      kind: "delivery-remaining",
      remainingPence: 1000,
      percent: 80,
    });
  });

  it("clamps percent into 0-100", () => {
    const below = fulfilmentProgress(0, { method: "DELIVERY", ...aheed });
    expect(below).toMatchObject({ kind: "below-minimum", percent: 0 });
  });
});
