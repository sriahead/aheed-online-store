import { describe, expect, it, vi } from "vitest";
import {
  eraseGuestOrderData,
  eraseVendorData,
  exportGuestOrderData,
  exportPersonalData,
} from "@/lib/repositories/data-rights";
import type { getPrisma } from "@/lib/db";

/**
 * #1135 (R18, R19) — a shopper-typed item note is personal data: the export carries it, and an
 * erasure that keeps an order for the money nulls it. Same Proxy stub as
 * `data-rights-marketing-consent.test.ts`: models named in `rows` answer with data, every other model
 * with the empty shape. The erasure tests prove which rows are targeted, not atomicity.
 */

const VENDOR = "vendor-a";
const USER = "user-1";

const ORDER = {
  id: "order-1",
  orderNumber: "AHD-1",
  addressId: "addr-1",
  fulfilmentMethod: "DELIVERY",
  status: "CONFIRMED",
  currency: "GBP",
  subtotalPence: 2000,
  discountPence: 0,
  deliveryFeePence: 0,
  totalPence: 2000,
  createdAt: new Date("2026-10-19T10:00:00Z"),
  guestEmail: "guest@example.com",
  items: [{ productName: "Goat", quantity: 2, unitPricePence: 1000, customNote: "curry cut" }],
  payment: null,
  statusEvents: [],
  address: null,
};

function makeClient(rows: Record<string, unknown[]>) {
  const calls: { model: string; method: string; args: unknown }[] = [];
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) =>
          vi.fn(async (args: unknown) => {
            calls.push({ model: name, method, args });
            switch (method) {
              case "count":
                return 0;
              case "findUnique":
                return null;
              case "findFirst":
                return rows[name]?.[0] ?? null;
              case "findUniqueOrThrow":
                return name === "vendor"
                  ? { id: VENDOR, name: "Store" }
                  : {
                      id: USER,
                      name: "A Shopper",
                      email: "shopper@example.com",
                      emailVerified: true,
                      role: "CUSTOMER",
                      createdAt: new Date("2026-01-01T00:00:00Z"),
                    };
              case "findMany":
                return rows[name] ?? [];
              default:
                return { count: 0 };
            }
          }),
      },
    );
  const client: object = new Proxy(
    {},
    {
      get: (_t, name: string) =>
        name === "$transaction" ? async (fn: (tx: unknown) => unknown) => fn(client) : model(name),
    },
  );
  return { calls, client: client as unknown as ReturnType<typeof getPrisma> };
}

describe("item notes in a data export (R18)", () => {
  it("carries the note on order items and cart items in the signed-in export", async () => {
    const { client, calls } = makeClient({
      order: [ORDER],
      cart: [
        {
          createdAt: new Date("2026-10-19T09:00:00Z"),
          items: [{ quantity: 1, customNote: "skin off", product: { name: "Chicken" } }],
        },
      ],
    });
    const exported = await exportPersonalData(client, VENDOR, USER);
    expect(exported.orders[0].items[0].customNote).toBe("curry cut");
    expect(exported.carts[0].items[0]).toEqual({
      product: "Chicken",
      quantity: 1,
      customNote: "skin off",
    });

    const orderQuery = calls.find((c) => c.model === "order" && c.method === "findMany");
    expect(JSON.stringify(orderQuery?.args)).toContain('"customNote":true');
  });

  it("carries the note on order items in the guest export", async () => {
    const { client } = makeClient({ order: [ORDER] });
    const exported = await exportGuestOrderData(client, VENDOR, "AHD-1", "guest@example.com");
    expect(exported?.order.items[0].customNote).toBe("curry cut");
  });
});

describe("item notes in an erasure (R19)", () => {
  it("nulls the notes on every order eraseVendorData anonymises", async () => {
    const { client, calls } = makeClient({ order: [ORDER] });
    await eraseVendorData(client, VENDOR, USER);
    const nulling = calls.find((c) => c.model === "orderItem" && c.method === "updateMany");
    expect(nulling?.args).toEqual({
      where: { vendorId: VENDOR, orderId: { in: ["order-1"] } },
      data: { customNote: null },
    });
  });

  it("nulls the notes on the one order eraseGuestOrderData anonymises", async () => {
    const { client, calls } = makeClient({ order: [ORDER] });
    await eraseGuestOrderData(client, VENDOR, "AHD-1", "guest@example.com");
    const nulling = calls.find((c) => c.model === "orderItem" && c.method === "updateMany");
    expect(nulling?.args).toEqual({
      where: { orderId: "order-1", vendorId: VENDOR },
      data: { customNote: null },
    });
  });
});
