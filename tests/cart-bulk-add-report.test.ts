import { describe, it, expect, vi } from "vitest";

// See tests/cart-add-outcome.test.ts: nothing may reach @prisma/client/wasm under vitest.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));

import { classifyBulkAdd } from "@/lib/cart-rules";
const { addCartItems } = await import("@/lib/repositories/cart");

/**
 * #957 (R16, R21) — the bulk add behind reorder, unpaid-order cancel, bundles and Shop your list
 * reports what it did with each line, and never lowers a line already in the cart.
 */

describe("classifyBulkAdd", () => {
  it("added: the whole request fits", () => {
    expect(classifyBulkAdd(1, 2, 10)).toEqual({
      write: 3,
      line: { requested: 2, added: 2, kind: "added" },
    });
  });

  it("partial: capped at stock", () => {
    expect(classifyBulkAdd(0, 3, 2)).toEqual({
      write: 2,
      line: { requested: 3, added: 2, kind: "partial" },
    });
  });

  it("unavailable: no stock, no write", () => {
    expect(classifyBulkAdd(0, 2, 0)).toEqual({
      write: null,
      line: { requested: 2, added: 0, kind: "unavailable" },
    });
  });

  it("at_limit: the cart already holds all the stock", () => {
    expect(classifyBulkAdd(4, 1, 4)).toEqual({
      write: null,
      line: { requested: 1, added: 0, kind: "at_limit" },
    });
  });

  it("at_limit, not a lower write, when the cart holds MORE than the stock", () => {
    expect(classifyBulkAdd(5, 1, 4)).toEqual({
      write: null,
      line: { requested: 1, added: 0, kind: "at_limit" },
    });
  });
});

describe("addCartItems report", () => {
  const VENDOR = "v-1";
  const identity = { userId: "u-1", guestToken: null };

  function fakes(
    products: { id: string; stock: number; active?: boolean; inCart: number | null }[],
  ) {
    const upsert = vi.fn(async () => ({}));
    const cartCreate = vi.fn(async () => ({ id: "cart-1" }));
    const prisma = {
      product: {
        findMany: vi.fn(async () =>
          products.map((p) => ({
            id: p.id,
            isActive: p.active ?? true,
            inventory: { quantity: p.stock },
          })),
        ),
      },
      cart: {
        findUnique: vi.fn(async () => ({ id: "cart-1", items: [] })),
        findFirst: vi.fn(async () => ({ id: "cart-1", items: [] })),
      },
    };
    const tx = {
      cartItem: {
        findUnique: vi.fn(
          async ({ where }: { where: { cartId_productId: { productId: string } } }) => {
            const inCart = products.find((p) => p.id === where.cartId_productId.productId)?.inCart;
            return inCart == null ? null : { quantity: inCart };
          },
        ),
        upsert,
      },
    };
    const prismaWs = {
      cart: { create: cartCreate },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const run = (lines: { productId: string; quantity: number }[]) =>
      addCartItems(prisma as never, prismaWs as never, VENDOR, identity, lines);
    return { run, upsert, cartCreate, prisma, prismaWs };
  }

  it("reports one entry per merged line, in each of the four kinds", async () => {
    const f = fakes([
      { id: "a", stock: 10, inCart: null },
      { id: "b", stock: 2, inCart: null },
      { id: "c", stock: 0, active: false, inCart: null },
      { id: "d", stock: 3, inCart: 3 },
    ]);
    const report = await f.run([
      { productId: "a", quantity: 1 },
      { productId: "a", quantity: 1 }, // merged with the line above
      { productId: "b", quantity: 3 },
      { productId: "c", quantity: 1 },
      { productId: "d", quantity: 1 },
    ]);

    expect(report).toEqual([
      { productId: "a", requested: 2, added: 2, kind: "added" },
      { productId: "b", requested: 3, added: 2, kind: "partial" },
      { productId: "c", requested: 1, added: 0, kind: "unavailable" },
      { productId: "d", requested: 1, added: 0, kind: "at_limit" },
    ]);
    // Only a and b are written.
    expect(f.upsert).toHaveBeenCalledTimes(2);
  });

  it("never lowers a line: cart holds 5, stock 4, add 1 writes nothing", async () => {
    const f = fakes([{ id: "a", stock: 4, inCart: 5 }]);
    await expect(f.run([{ productId: "a", quantity: 1 }])).resolves.toEqual([
      { productId: "a", requested: 1, added: 0, kind: "at_limit" },
    ]);
    expect(f.upsert).not.toHaveBeenCalled();
  });

  it("with no stock anywhere, creates no cart and reports every line unavailable", async () => {
    const f = fakes([
      { id: "a", stock: 0, inCart: null },
      { id: "b", stock: 0, inCart: null },
    ]);
    await expect(
      f.run([
        { productId: "a", quantity: 2 },
        { productId: "b", quantity: 1 },
      ]),
    ).resolves.toEqual([
      { productId: "a", requested: 2, added: 0, kind: "unavailable" },
      { productId: "b", requested: 1, added: 0, kind: "unavailable" },
    ]);
    expect(f.cartCreate).not.toHaveBeenCalled();
    expect(f.prisma.cart.findUnique).not.toHaveBeenCalled();
    expect(f.prismaWs.$transaction).not.toHaveBeenCalled();
  });

  it("an empty list reports nothing", async () => {
    const f = fakes([]);
    await expect(f.run([])).resolves.toEqual([]);
  });
});
