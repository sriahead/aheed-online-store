import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/repositories/orders.ts imports lib/db (→ @prisma/client/wasm, unresolvable
// under vitest) and lib/tenant. Mock both so the module loads; every test below
// drives placeOrder with a fake tx, which is exactly why R9a made it take its
// client and vendorId as explicit arguments.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn() }));

const { placeOrder, CheckoutError } = await import("@/lib/repositories/orders");

const VENDOR = "v-aheed";

type FakeState = {
  cart: { id: string; items: { productId: string; quantity: number }[] } | null;
  products: {
    id: string;
    name: string;
    basePrice: number;
    isActive: boolean;
    inventory: { quantity: number } | null;
  }[];
  /** How many rows the guarded decrement claims to have updated. */
  decrementCount: number;
};

let state: FakeState;
const created: Record<string, unknown[]> = {};

/** Minimal Prisma double: only the calls placeOrder actually makes. */
function fakePrisma() {
  const tx = {
    cart: { findFirst: async () => state.cart },
    product: { findMany: async () => state.products },
    inventory: { updateMany: async () => ({ count: state.decrementCount }) },
    address: {
      create: async ({ data }: { data: unknown }) => {
        created.address.push(data);
        return { id: "addr-1" };
      },
    },
    order: {
      findUnique: async () => null, // no order-number collision
      create: async ({ data }: { data: { orderNumber: string } }) => {
        created.order.push(data);
        return { id: "order-1", orderNumber: data.orderNumber };
      },
    },
    orderItem: {
      createMany: async ({ data }: { data: unknown[] }) => {
        created.orderItem.push(...data);
        return { count: data.length };
      },
    },
    payment: {
      create: async ({ data }: { data: unknown }) => {
        created.payment.push(data);
        return {};
      },
    },
    orderStatusEvent: {
      create: async ({ data }: { data: unknown }) => {
        created.statusEvent.push(data);
        return {};
      },
    },
    cartItem: {
      deleteMany: async (args: unknown) => {
        created.cartCleared.push(args);
        return { count: 1 };
      },
    },
  };
  return {
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as never;
}

const input = (over: Partial<Parameters<typeof placeOrder>[2]> = {}) =>
  ({
    cartId: "cart-1",
    userId: null,
    guestEmail: "shopper@example.com",
    address: {
      recipientName: "Sam Shopper",
      phone: "07700 900123",
      line1: "1 High Street",
      line2: null,
      city: "Milton Keynes",
      postcode: "MK9 1AA",
      notes: null,
    },
    rules: {
      deliveryFeePence: 349,
      freeDeliveryThresholdPence: 3000,
      minimumOrderPence: 1500,
    },
    vendorSlug: "aheed-food-centre",
    ...over,
  }) as Parameters<typeof placeOrder>[2];

beforeEach(() => {
  for (const key of ["address", "order", "orderItem", "payment", "statusEvent", "cartCleared"]) {
    created[key] = [];
  }
  state = {
    cart: { id: "cart-1", items: [{ productId: "p1", quantity: 2 }] },
    products: [
      { id: "p1", name: "Bananas", basePrice: 1000, isActive: true, inventory: { quantity: 10 } },
    ],
    decrementCount: 1,
  };
});

describe("placeOrder — buyer identity (R5)", () => {
  it("rejects both userId and guestEmail", async () => {
    await expect(
      placeOrder(fakePrisma(), VENDOR, input({ userId: "u1", guestEmail: "a@b.c" })),
    ).rejects.toThrow(/exactly one/i);
  });

  it("rejects neither", async () => {
    await expect(
      placeOrder(fakePrisma(), VENDOR, input({ userId: null, guestEmail: null })),
    ).rejects.toThrow(/exactly one/i);
  });

  it("accepts a guest", async () => {
    await expect(placeOrder(fakePrisma(), VENDOR, input())).resolves.toMatchObject({
      totalPence: 2000 + 349,
    });
  });

  it("accepts a member", async () => {
    await expect(
      placeOrder(fakePrisma(), VENDOR, input({ userId: "u1", guestEmail: null })),
    ).resolves.toBeTruthy();
  });
});

describe("placeOrder — refusals (R14)", () => {
  it("refuses an empty cart", async () => {
    state.cart = { id: "cart-1", items: [] };
    await expect(placeOrder(fakePrisma(), VENDOR, input())).rejects.toMatchObject({
      code: "CART_EMPTY",
    });
  });

  it("refuses a missing cart", async () => {
    state.cart = null;
    await expect(placeOrder(fakePrisma(), VENDOR, input())).rejects.toMatchObject({
      code: "CART_EMPTY",
    });
  });

  it("refuses when a line's product went inactive", async () => {
    state.products[0].isActive = false;
    await expect(placeOrder(fakePrisma(), VENDOR, input())).rejects.toMatchObject({
      code: "LINE_UNAVAILABLE",
    });
  });

  it("refuses when a line's product has no stock", async () => {
    state.products[0].inventory = { quantity: 0 };
    await expect(placeOrder(fakePrisma(), VENDOR, input())).rejects.toMatchObject({
      code: "LINE_UNAVAILABLE",
    });
  });

  it("treats a missing Inventory row as unavailable, not unlimited", async () => {
    state.products[0].inventory = null;
    await expect(placeOrder(fakePrisma(), VENDOR, input())).rejects.toMatchObject({
      code: "LINE_UNAVAILABLE",
    });
  });

  it("refuses below the vendor's minimum order", async () => {
    state.products[0].basePrice = 100; // 2 × £1.00 = £2.00, minimum is £15.00
    await expect(placeOrder(fakePrisma(), VENDOR, input())).rejects.toMatchObject({
      code: "BELOW_MINIMUM",
    });
  });
});

describe("placeOrder — stock guard (R11)", () => {
  it("throws INSUFFICIENT_STOCK when the guarded decrement matches no row", async () => {
    // count === 0 is how Postgres tells us someone else took the last one.
    state.decrementCount = 0;
    await expect(placeOrder(fakePrisma(), VENDOR, input())).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });
  });

  it("creates nothing when the decrement fails", async () => {
    state.decrementCount = 0;
    await placeOrder(fakePrisma(), VENDOR, input()).catch(() => {});
    expect(created.order).toHaveLength(0);
    expect(created.address).toHaveLength(0);
    expect(created.payment).toHaveLength(0);
    expect(created.cartCleared).toHaveLength(0);
  });
});

describe("placeOrder — what it writes", () => {
  it("snapshots product name and unit price onto the order item", async () => {
    await placeOrder(fakePrisma(), VENDOR, input());
    expect(created.orderItem[0]).toMatchObject({
      productName: "Bananas",
      unitPricePence: 1000,
      quantity: 2,
      lineTotalPence: 2000,
    });
  });

  it("records money computed server-side, not supplied by the caller", async () => {
    await placeOrder(fakePrisma(), VENDOR, input());
    expect(created.order[0]).toMatchObject({
      subtotalPence: 2000,
      deliveryFeePence: 349,
      totalPence: 2349,
    });
  });

  it("opens the order PENDING_PAYMENT with a matching status event", async () => {
    await placeOrder(fakePrisma(), VENDOR, input());
    expect(created.statusEvent[0]).toMatchObject({ status: "PENDING_PAYMENT" });
  });

  it("records a PENDING payment for the order total", async () => {
    await placeOrder(fakePrisma(), VENDOR, input());
    expect(created.payment[0]).toMatchObject({ amountPence: 2349, provider: "stub" });
  });

  it("clears the cart last, which is what makes a double submit safe (R13)", async () => {
    await placeOrder(fakePrisma(), VENDOR, input());
    expect(created.cartCleared).toHaveLength(1);
  });

  it("stamps the vendor on every child row", async () => {
    await placeOrder(fakePrisma(), VENDOR, input());
    expect(created.address[0]).toMatchObject({ vendorId: VENDOR });
    expect(created.order[0]).toMatchObject({ vendorId: VENDOR });
    expect(created.orderItem[0]).toMatchObject({ vendorId: VENDOR });
    expect(created.payment[0]).toMatchObject({ vendorId: VENDOR });
    expect(created.statusEvent[0]).toMatchObject({ vendorId: VENDOR });
  });
});

describe("CheckoutError", () => {
  it("carries a machine-readable code the UI can branch on", () => {
    expect(new CheckoutError("CART_EMPTY", "empty").code).toBe("CART_EMPTY");
  });
});
