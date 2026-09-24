import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #890 R23 and #889 R31/R32 at the checkout action, with every collaborator mocked.
 *
 * - The order is priced from the ADDRESS postcode; when that resolves to different money than the
 *   page quoted, nothing is placed, the `delivery-postcode` cookie moves, and the shopper is told.
 * - A shopper with no cookie whose area carries no overrides is quoted the defaults and is NOT
 *   refused — the comparison is on values, not on which row matched.
 * - A checkout refusal for an out-of-area postcode is counted as `CHECKOUT`, and a failing count
 *   leaves the shopper's response unchanged.
 */

const m = vi.hoisted(() => ({
  createOrder: vi.fn(),
  eligibility: vi.fn(),
  setDeliveryPostcode: vi.fn(),
  recordRefusal: vi.fn(),
  redirect: vi.fn(),
  profile: {
    id: "vendor-1",
    slug: "aheed",
    timezone: "Europe/London",
    deliveryFeePence: 349,
    minimumOrderPence: 0,
    freeDeliveryThresholdPence: 4000,
    deliveryAreas: [
      {
        prefix: "MK",
        deliveryFeePence: null,
        minimumOrderPence: null,
        freeDeliveryThresholdPence: null,
      },
      {
        prefix: "MK10",
        deliveryFeePence: 599,
        minimumOrderPence: 3000,
        freeDeliveryThresholdPence: 0,
      },
    ],
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:8787" }),
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => m.redirect(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(() => ({})), getPrismaWs: vi.fn() }));
vi.mock("@/lib/cart-identity", () => ({
  getCartIdentity: async () => ({ userId: "u1", guestToken: null }),
}));
vi.mock("@/lib/cart-service", () => ({
  getCartRepository: () => ({
    getSummary: async () => ({ mergePending: false, lines: [{ id: "l1" }] }),
    getCartId: async () => "cart-1",
  }),
}));
vi.mock("@/lib/orders-service", () => ({
  getOrderRepository: () => ({ createOrder: m.createOrder }),
}));
vi.mock("@/lib/vendor-service", () => ({ getCurrentVendorProfile: async () => m.profile }));
vi.mock("@/lib/delivery-eligibility-service", () => ({
  getDeliveryEligibility: (...a: unknown[]) => m.eligibility(...a),
}));
vi.mock("@/lib/customer-addresses-service", () => ({
  getCustomerAddressService: () => ({ save: vi.fn() }),
}));
vi.mock("@/features/storefront/delivery", () => ({
  setDeliveryPostcode: (...a: unknown[]) => m.setDeliveryPostcode(...a),
}));
vi.mock("@/lib/repositories/delivery-refusals", () => ({
  recordDeliveryRefusal: (...a: unknown[]) => m.recordRefusal(...a),
}));

import { placeOrderAction } from "@/features/checkout/place-order";

function checkoutForm(postcode: string, quote: string | null): FormData {
  const form = new FormData();
  form.set("fulfilmentMethod", "DELIVERY");
  form.set("postcode", postcode);
  form.set("recipientName", "Test Shopper");
  form.set("phone", "07000000000");
  form.set("line1", "1 Test Street");
  form.set("city", "Milton Keynes");
  if (quote !== null) form.set("quotedDeliveryRules", quote);
  return form;
}

function verdict(status: "DELIVERABLE" | "OUTSIDE_DELIVERY_AREA", postcode: string) {
  return {
    status,
    postcode,
    deliverable: status === "DELIVERABLE",
    verified: true,
    areaCovered: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.createOrder.mockResolvedValue({
    orderNumber: "AHD-1",
    redirectUrl: "/pay",
    confirmationToken: "t",
  });
});

describe("place-order prices from the address postcode (#890 R23)", () => {
  it("refuses, places nothing and moves the cookie when the address resolves to different charges", async () => {
    m.eligibility.mockResolvedValue(verdict("DELIVERABLE", "MK10 1AA"));

    const state = await placeOrderAction({ error: null }, checkoutForm("MK10 1AA", "349:0:4000"));

    expect(state.error).toBe(
      "The delivery charge for MK10 1AA is different. Please review your updated total and place the order again.",
    );
    expect(m.createOrder).not.toHaveBeenCalled();
    const moved = m.setDeliveryPostcode.mock.calls[0][0] as FormData;
    expect(moved.get("postcode")).toBe("MK10 1AA");
  });

  it("proceeds with the area's charges when the quote matches", async () => {
    m.eligibility.mockResolvedValue(verdict("DELIVERABLE", "MK10 1AA"));

    await placeOrderAction({ error: null }, checkoutForm("MK10 1AA", "599:3000:0"));

    expect(m.createOrder).toHaveBeenCalledTimes(1);
    expect(m.createOrder.mock.calls[0][0].rules).toEqual({
      deliveryFeePence: 599,
      freeDeliveryThresholdPence: 0,
      minimumOrderPence: 3000,
    });
    expect(m.redirect).toHaveBeenCalledWith("/pay");
  });

  it("does not refuse a no-cookie shopper whose area carries no overrides", async () => {
    // The page had no postcode, so it quoted the vendor defaults; MK9 matches the MK row, which
    // inherits every default — same values, different row, no refusal.
    m.eligibility.mockResolvedValue(verdict("DELIVERABLE", "MK9 2EA"));

    await placeOrderAction({ error: null }, checkoutForm("MK9 2EA", "349:0:4000"));

    expect(m.createOrder).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing or malformed quote", async () => {
    m.eligibility.mockResolvedValue(verdict("DELIVERABLE", "MK9 2EA"));

    expect((await placeOrderAction({ error: null }, checkoutForm("MK9 2EA", null))).error).toMatch(
      /delivery charge for MK9 2EA is different/,
    );
    expect(
      (await placeOrderAction({ error: null }, checkoutForm("MK9 2EA", "free"))).error,
    ).toMatch(/is different/);
    expect(m.createOrder).not.toHaveBeenCalled();
  });
});

describe("place-order counts out-of-area refusals (#889 R31/R32)", () => {
  it("records CHECKOUT for an out-of-area postcode", async () => {
    m.eligibility.mockResolvedValue(verdict("OUTSIDE_DELIVERY_AREA", "MK17 8NL"));
    m.recordRefusal.mockResolvedValue(undefined);

    const state = await placeOrderAction({ error: null }, checkoutForm("MK17 8NL", "349:0:4000"));

    expect(state.error).toBe("Sorry — we don't deliver to MK17 8NL yet.");
    expect(m.recordRefusal).toHaveBeenCalledWith(
      expect.anything(),
      "vendor-1",
      "MK17",
      expect.any(Date),
      "CHECKOUT",
    );
  });

  it("returns exactly the same refusal when the count fails", async () => {
    m.eligibility.mockResolvedValue(verdict("OUTSIDE_DELIVERY_AREA", "MK17 8NL"));
    m.recordRefusal.mockRejectedValue(new Error("db down"));

    const state = await placeOrderAction({ error: null }, checkoutForm("MK17 8NL", "349:0:4000"));

    expect(state).toEqual({ error: "Sorry — we don't deliver to MK17 8NL yet." });
    expect(m.createOrder).not.toHaveBeenCalled();
  });
});
