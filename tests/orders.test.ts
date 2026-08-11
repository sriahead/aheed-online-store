import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/repositories/orders.ts imports lib/db (→ @prisma/client/wasm, unresolvable
// under vitest) and lib/tenant. Mock both so the module loads; every test below
// drives placeOrder with a fake tx, which is exactly why R9a made it take its
// client and vendorId as explicit arguments.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn() }));
// Keep the provider out of these tests: they assert what the ORDER TRANSACTION
// writes. The adapter itself is covered by tests/payments.test.ts.
vi.mock("@/lib/payments", () => ({
  getPaymentService: () => ({
    createPayment: async () => ({
      provider: "stub",
      status: "PENDING",
      providerReference: null,
      redirectUrl: null,
    }),
  }),
}));

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
    // placeOrder writes the provider reference after the transaction commits.
    payment: {
      update: async ({ data }: { data: unknown }) => {
        created.paymentUpdate.push(data);
        return {};
      },
    },
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
    returnOrigin: "https://staging.aheedfoodcentre.nocaped.com",
    ...over,
  }) as Parameters<typeof placeOrder>[2];

beforeEach(() => {
  for (const key of [
    "address",
    "order",
    "orderItem",
    "payment",
    "statusEvent",
    "cartCleared",
    "paymentUpdate",
  ]) {
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
    // Created inside the transaction with no provider reference — the external
    // call happens after commit (P3c R6), so no HTTP round-trip holds the
    // transaction open.
    expect(created.payment[0]).toMatchObject({
      amountPence: 2349,
      provider: "pending",
      providerReference: null,
    });
  });

  it("fills in the provider reference only after the transaction commits", async () => {
    await placeOrder(fakePrisma(), VENDOR, input());
    expect(created.paymentUpdate).toHaveLength(1);
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

// ---- advanceOrderStatus (P4b, #125) ----------------------------------------

const { advanceOrderStatus } = await import("@/lib/repositories/orders");

const ACTOR = { userId: "user-staff" };
const AHEED = "v-aheed";

type AdvanceState = {
  /** The order the vendor-scoped lookup finds, or null for "no such order". */
  found: { id: string; status: string } | null;
  /** Rows the guarded compare-and-set claims to have updated. */
  updateCount: number;
};

/**
 * Prisma double for the transition path only. Deliberately separate from
 * fakePrisma(): that one models the checkout transaction, and folding both into
 * one object would make each test harder to read than either is alone.
 */
function fakeAdvancePrisma(advance: AdvanceState) {
  const writes = { updates: [] as unknown[], events: [] as unknown[] };
  const tx = {
    order: {
      updateMany: async (args: unknown) => {
        writes.updates.push(args);
        return { count: advance.updateCount };
      },
    },
    orderStatusEvent: {
      create: async ({ data }: { data: unknown }) => {
        writes.events.push(data);
        return {};
      },
    },
  };
  const prisma = {
    order: {
      findFirst: async () => advance.found,
      // findOrderForWebhook's post-commit re-read.
      findUnique: async () => ({
        id: "order-1",
        vendorId: AHEED,
        orderNumber: "AHD-ABC123",
        status: "OUT_FOR_DELIVERY",
        totalPence: 1250,
        subtotalPence: 1000,
        deliveryFeePence: 250,
        guestEmail: "shopper@example.com",
        user: null,
        items: [],
      }),
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as never;
  return { prisma, writes };
}

describe("advanceOrderStatus", () => {
  it("advances a legal rung and records WHO moved it", async () => {
    const { prisma, writes } = fakeAdvancePrisma({
      found: { id: "order-1", status: "CONFIRMED" },
      updateCount: 1,
    });

    const result = await advanceOrderStatus(prisma, AHEED, "AHD-ABC123", "OUT_FOR_DELIVERY", ACTOR);

    expect(result.ok).toBe(true);
    expect(writes.events).toHaveLength(1);
    expect(writes.events[0]).toMatchObject({
      status: "OUT_FOR_DELIVERY",
      createdByUserId: "user-staff",
    });
  });

  it("compares and sets on the PERSISTED status, so a stale submit cannot double-advance", async () => {
    const { prisma, writes } = fakeAdvancePrisma({
      found: { id: "order-1", status: "CONFIRMED" },
      updateCount: 1,
    });
    await advanceOrderStatus(prisma, AHEED, "AHD-ABC123", "OUT_FOR_DELIVERY", ACTOR);

    // The guard is in the WHERE, not a prior read: vendorId AND the status the
    // caller observed. Anything that moved the row in between matches nothing.
    expect(writes.updates[0]).toMatchObject({
      where: { id: "order-1", vendorId: AHEED, status: "CONFIRMED" },
    });
  });

  it("writes NOTHING when the guarded update matches no row (someone else got there first)", async () => {
    const { prisma, writes } = fakeAdvancePrisma({
      found: { id: "order-1", status: "CONFIRMED" },
      updateCount: 0,
    });

    const result = await advanceOrderStatus(prisma, AHEED, "AHD-ABC123", "OUT_FOR_DELIVERY", ACTOR);

    expect(result).toEqual({ ok: false, reason: "illegal-transition" });
    expect(writes.events).toHaveLength(0);
  });

  it("rejects an illegal rung without touching the database", async () => {
    for (const [from, to] of [
      ["PENDING_PAYMENT", "DELIVERED"],
      ["CONFIRMED", "DELIVERED"],
      ["DELIVERED", "OUT_FOR_DELIVERY"],
      ["CANCELLED", "OUT_FOR_DELIVERY"],
    ]) {
      const { prisma, writes } = fakeAdvancePrisma({
        found: { id: "order-1", status: from },
        updateCount: 1,
      });

      const result = await advanceOrderStatus(prisma, AHEED, "AHD-ABC123", to, ACTOR);

      expect(result).toEqual({ ok: false, reason: "illegal-transition" });
      expect(writes.updates).toHaveLength(0);
      expect(writes.events).toHaveLength(0);
    }
  });

  it("rejects a forged status the same way as a merely illegal one", async () => {
    const { prisma, writes } = fakeAdvancePrisma({
      found: { id: "order-1", status: "CONFIRMED" },
      updateCount: 1,
    });

    const result = await advanceOrderStatus(prisma, AHEED, "AHD-ABC123", "BANANA", ACTOR);

    expect(result).toEqual({ ok: false, reason: "illegal-transition" });
    expect(writes.updates).toHaveLength(0);
    expect(writes.events).toHaveLength(0);
  });

  it("reports another vendor's order as not-found, indistinguishable from no order", async () => {
    // The scoping is `where: { orderNumber, vendorId }` — a foreign order simply
    // does not match, so the caller cannot probe for its existence.
    const { prisma, writes } = fakeAdvancePrisma({ found: null, updateCount: 1 });

    const result = await advanceOrderStatus(prisma, AHEED, "SRI-ZZZ999", "OUT_FOR_DELIVERY", ACTOR);

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(writes.updates).toHaveLength(0);
    expect(writes.events).toHaveLength(0);
  });

  it("returns data rather than throwing, for every rejection path", async () => {
    const rejections = [
      { found: null as AdvanceState["found"], to: "OUT_FOR_DELIVERY" },
      { found: { id: "order-1", status: "DELIVERED" }, to: "OUT_FOR_DELIVERY" },
      { found: { id: "order-1", status: "CONFIRMED" }, to: "NOT_A_STATUS" },
    ];

    for (const { found, to } of rejections) {
      const { prisma } = fakeAdvancePrisma({ found, updateCount: 1 });
      // No try/catch: a throw fails the test rather than being absorbed.
      const result = await advanceOrderStatus(prisma, AHEED, "AHD-ABC123", to, ACTOR);
      expect(result.ok).toBe(false);
    }
  });

  it("sends no email itself — the caller does that after the commit", async () => {
    // The 5s-Postgres-timeout lesson from P3c: no HTTP inside the transaction.
    const { prisma } = fakeAdvancePrisma({
      found: { id: "order-1", status: "CONFIRMED" },
      updateCount: 1,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await advanceOrderStatus(prisma, AHEED, "AHD-ABC123", "OUT_FOR_DELIVERY", ACTOR);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
