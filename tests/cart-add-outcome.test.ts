import { describe, it, expect, vi } from "vitest";

// lib/repositories/cart.ts imports lib/db only as a type and lib/tier-pricing /
// product-tiers at module level; mock lib/db anyway so nothing reaches
// @prisma/client/wasm under vitest.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));

import { classifyAdd } from "@/lib/cart-rules";
const { addCartItem } = await import("@/lib/repositories/cart");

/**
 * #956 — an add reports what it actually did (R1, R2, R20, R21).
 *
 * Before #956 `addCartItem` returned nothing, and every resolved add read
 * "Added": a sold-out product, a request clamped to the stock left, and a cart
 * already holding all the stock (where the same quantity — or, if stock had
 * fallen, a LOWER one — was written back).
 */

describe("classifyAdd", () => {
  it.each([0, 100, 1.5, -1, Number.NaN])(
    "refuses delta %s as INVALID_QUANTITY, writing nothing",
    (delta) => {
      expect(classifyAdd(0, delta, 10)).toEqual({
        write: null,
        outcome: { kind: "none", reason: "INVALID_QUANTITY" },
      });
    },
  );

  it("accepts the picker's bounds, 1 and 99", () => {
    expect(classifyAdd(0, 1, 200).outcome.kind).toBe("added");
    expect(classifyAdd(0, 99, 200).outcome.kind).toBe("added");
  });

  it("refuses an add with no stock as SOLD_OUT", () => {
    expect(classifyAdd(0, 1, 0)).toEqual({
      write: null,
      outcome: { kind: "none", reason: "SOLD_OUT" },
    });
  });

  it("refuses an add when the cart already holds exactly the stock", () => {
    expect(classifyAdd(3, 1, 3)).toEqual({
      write: null,
      outcome: { kind: "none", reason: "AT_STOCK_LIMIT", inCart: 3 },
    });
  });

  it("refuses, rather than lowers, when the cart holds MORE than the stock", () => {
    expect(classifyAdd(5, 1, 2)).toEqual({
      write: null,
      outcome: { kind: "none", reason: "AT_STOCK_LIMIT", inCart: 5 },
    });
  });

  it("adds the whole request when it fits", () => {
    expect(classifyAdd(1, 2, 3)).toEqual({
      write: 3,
      outcome: { kind: "added", added: 2, inCart: 3 },
    });
  });

  it("adds only what stock allows, and says so", () => {
    expect(classifyAdd(0, 5, 2)).toEqual({
      write: 2,
      outcome: { kind: "partial", added: 2, requested: 5, inCart: 2 },
    });
    expect(classifyAdd(1, 5, 3)).toEqual({
      write: 3,
      outcome: { kind: "partial", added: 2, requested: 5, inCart: 3 },
    });
  });
});

describe("addCartItem", () => {
  const VENDOR = "v-1";
  const PRODUCT = "p-1";
  const identity = { userId: null, guestToken: "guest-1" };

  /** Fake clients: one product with `stock`, one existing cart holding `inCart` of it. */
  function fakes({ stock, inCart }: { stock: number; inCart: number | null }) {
    const upsert = vi.fn(async () => ({}));
    const cartCreate = vi.fn(async () => ({ id: "cart-1" }));
    const prisma = {
      product: {
        findMany: vi.fn(async () => [
          { id: PRODUCT, isActive: true, inventory: { quantity: stock } },
        ]),
      },
      cart: { findUnique: vi.fn(async () => ({ id: "cart-1", items: [] })) },
    };
    const tx = {
      cartItem: {
        findUnique: vi.fn(async () => (inCart === null ? null : { quantity: inCart })),
        upsert,
      },
    };
    const prismaWs = {
      cart: { create: cartCreate },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const run = (delta: number) =>
      // The fakes cover only what addCartItem touches.
      addCartItem(prisma as never, prismaWs as never, VENDOR, identity, PRODUCT, delta);
    return { run, upsert, cartCreate, prisma };
  }

  it("returns added and writes the new quantity", async () => {
    const f = fakes({ stock: 10, inCart: 1 });
    await expect(f.run(2)).resolves.toEqual({ kind: "added", added: 2, inCart: 3 });
    expect(f.upsert).toHaveBeenCalledTimes(1);
    expect(f.upsert.mock.calls[0]).toEqual([expect.objectContaining({ update: { quantity: 3 } })]);
  });

  it("returns partial and writes the stock", async () => {
    const f = fakes({ stock: 2, inCart: null });
    await expect(f.run(5)).resolves.toEqual({
      kind: "partial",
      added: 2,
      requested: 5,
      inCart: 2,
    });
    expect(f.upsert.mock.calls[0]).toEqual([
      expect.objectContaining({ create: expect.objectContaining({ quantity: 2 }) }),
    ]);
  });

  it("SOLD_OUT: no upsert, and no cart is looked up or created", async () => {
    const f = fakes({ stock: 0, inCart: null });
    await expect(f.run(1)).resolves.toEqual({ kind: "none", reason: "SOLD_OUT" });
    expect(f.upsert).not.toHaveBeenCalled();
    expect(f.cartCreate).not.toHaveBeenCalled();
  });

  it("AT_STOCK_LIMIT: no upsert when the cart holds all the stock", async () => {
    const f = fakes({ stock: 2, inCart: 2 });
    await expect(f.run(1)).resolves.toEqual({ kind: "none", reason: "AT_STOCK_LIMIT", inCart: 2 });
    expect(f.upsert).not.toHaveBeenCalled();
  });

  it("AT_STOCK_LIMIT: no upsert (so no lowering) when the cart holds more than the stock", async () => {
    const f = fakes({ stock: 2, inCart: 5 });
    await expect(f.run(1)).resolves.toEqual({ kind: "none", reason: "AT_STOCK_LIMIT", inCart: 5 });
    expect(f.upsert).not.toHaveBeenCalled();
  });

  it("INVALID_QUANTITY: no upsert and no database read at all", async () => {
    const f = fakes({ stock: 10, inCart: null });
    await expect(f.run(0)).resolves.toEqual({ kind: "none", reason: "INVALID_QUANTITY" });
    expect(f.upsert).not.toHaveBeenCalled();
    expect(f.prisma.product.findMany).not.toHaveBeenCalled();
  });
});
