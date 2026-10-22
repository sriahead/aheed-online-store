import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));

const { addCartItem, addCartItems, setCartNote } = await import("@/lib/repositories/cart");

/**
 * #1135 — a shopper note on a basket line (R6, R8). The repository is where the note is normalised
 * and the acceptance rule applied, so these cases cover the product page add, order-again and the
 * basket's set-note action alike.
 */

const VENDOR = "v-1";
const PRODUCT = "p-1";
const identity = { userId: null, guestToken: "guest-1" };

/**
 * Fake clients: one product with stock, whose note acceptance is `accepts`, and a cart that holds
 * `inCart` of it (null = not in the cart). `product.findMany` serves both the stock read and the
 * acceptance read, so it returns every field either selects.
 */
function fakes({ accepts, inCart }: { accepts: boolean; inCart: number | null }) {
  const upsert = vi.fn(async () => ({}));
  const update = vi.fn(async () => ({}));
  const prisma = {
    product: {
      findMany: vi.fn(async () => [
        {
          id: PRODUCT,
          isActive: true,
          restriction: null,
          inventory: { quantity: 10, stockMode: "TRACKED" },
          allowsCustomNote: accepts,
          category: { allowsCustomNote: false, parent: null },
        },
      ]),
    },
    cart: {
      findUnique: vi.fn(async () => ({
        id: "cart-1",
        items: inCart === null ? [] : [{ productId: PRODUCT, quantity: inCart, customNote: null }],
      })),
    },
    cartItem: { update },
  };
  const tx = {
    cartItem: {
      findUnique: vi.fn(async () => (inCart === null ? null : { quantity: inCart })),
      upsert,
    },
  };
  const prismaWs = {
    cart: { create: vi.fn(async () => ({ id: "cart-1" })) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  type UpsertArgs = { create: Record<string, unknown>; update: Record<string, unknown> };
  const lastUpsert = () => (upsert.mock.calls.at(-1) as unknown as [UpsertArgs])[0];
  return { prisma, prismaWs, upsert, update, lastUpsert };
}

describe("addCartItem with a note (R6)", () => {
  it("stores the normalised note on a new line, and replaces it on an existing one", async () => {
    const f = fakes({ accepts: true, inCart: 1 });
    await addCartItem(
      f.prisma as never,
      f.prismaWs as never,
      VENDOR,
      identity,
      PRODUCT,
      1,
      "  curry\ncut ",
    );
    expect(f.lastUpsert().create.customNote).toBe("curry cut");
    expect(f.lastUpsert().update).toEqual({ quantity: 2, customNote: "curry cut" });
  });

  it("leaves an existing note alone when the add carries an empty note", async () => {
    const f = fakes({ accepts: true, inCart: 1 });
    await addCartItem(f.prisma as never, f.prismaWs as never, VENDOR, identity, PRODUCT, 1, "   ");
    expect(f.lastUpsert().update).toEqual({ quantity: 2 });
  });

  it("leaves an existing note alone when the add carries no note at all", async () => {
    const f = fakes({ accepts: true, inCart: 1 });
    await addCartItem(f.prisma as never, f.prismaWs as never, VENDOR, identity, PRODUCT, 1);
    expect(f.lastUpsert().update).toEqual({ quantity: 2 });
    expect(f.lastUpsert().create.customNote).toBeNull();
  });

  it("drops a note for a product that does not take notes, and still adds", async () => {
    const f = fakes({ accepts: false, inCart: null });
    const outcome = await addCartItem(
      f.prisma as never,
      f.prismaWs as never,
      VENDOR,
      identity,
      PRODUCT,
      1,
      "curry cut",
    );
    expect(outcome.kind).toBe("added");
    expect(f.lastUpsert().create.customNote).toBeNull();
    expect(f.lastUpsert().update).toEqual({ quantity: 1 });
  });
});

describe("addCartItems carries a note (order again, R13)", () => {
  it("writes an accepted line's note and drops a refused one", async () => {
    const accepted = fakes({ accepts: true, inCart: null });
    await addCartItems(accepted.prisma as never, accepted.prismaWs as never, VENDOR, identity, [
      { productId: PRODUCT, quantity: 1, customNote: "curry cut" },
    ]);
    expect(accepted.lastUpsert().create.customNote).toBe("curry cut");

    const refused = fakes({ accepts: false, inCart: null });
    await addCartItems(refused.prisma as never, refused.prismaWs as never, VENDOR, identity, [
      { productId: PRODUCT, quantity: 1, customNote: "curry cut" },
    ]);
    expect(refused.lastUpsert().create.customNote).toBeNull();
  });
});

describe("setCartNote (R8)", () => {
  it("saves the normalised note on a line in the caller's basket", async () => {
    const f = fakes({ accepts: true, inCart: 1 });
    const outcome = await setCartNote(f.prisma as never, VENDOR, identity, PRODUCT, " curry  cut ");
    expect(outcome).toEqual({ ok: true, customNote: "curry cut" });
    expect(f.update).toHaveBeenCalledExactlyOnceWith({
      where: { cartId_productId: { cartId: "cart-1", productId: PRODUCT } },
      data: { customNote: "curry cut" },
    });
  });

  it("clears the note with an empty string", async () => {
    const f = fakes({ accepts: true, inCart: 1 });
    expect(await setCartNote(f.prisma as never, VENDOR, identity, PRODUCT, "")).toEqual({
      ok: true,
      customNote: null,
    });
    expect(f.update).toHaveBeenCalledOnce();
  });

  it("refuses a product that does not take notes, writing nothing", async () => {
    const f = fakes({ accepts: false, inCart: 1 });
    expect(await setCartNote(f.prisma as never, VENDOR, identity, PRODUCT, "curry cut")).toEqual({
      ok: false,
      reason: "NOTES_NOT_TAKEN",
    });
    expect(f.update).not.toHaveBeenCalled();
  });

  it("still lets a shopper clear a note the product no longer takes", async () => {
    const f = fakes({ accepts: false, inCart: 1 });
    expect((await setCartNote(f.prisma as never, VENDOR, identity, PRODUCT, "")).ok).toBe(true);
  });

  it("refuses a product that is not in the caller's basket, writing nothing", async () => {
    const f = fakes({ accepts: true, inCart: null });
    expect(await setCartNote(f.prisma as never, VENDOR, identity, PRODUCT, "curry cut")).toEqual({
      ok: false,
      reason: "NOT_IN_CART",
    });
    expect(f.update).not.toHaveBeenCalled();
  });
});
