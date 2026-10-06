import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #988 (R22, R23, R24) — placing an order is the second way to ask whether a code exists, so it
 * shares the Apply control's unknown-code throttle. Same harness as
 * `tests/place-order-delivery-pricing.test.ts`; the real throttle SERVICE runs, with only its
 * repository mocked, so the fail-open behaviour is what is under test.
 */

const m = vi.hoisted(() => ({
  createOrder: vi.fn(),
  redirect: vi.fn(),
  profile: {
    id: "vendor-1",
    slug: "aheed",
    timezone: "Europe/London",
    deliveryFeePence: 0,
    minimumOrderPence: 0,
    freeDeliveryThresholdPence: null,
    deliveryAreas: [],
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:8787", "cf-connecting-ip": "203.0.113.7" }),
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => m.redirect(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(() => ({})), getPrismaWs: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn(async () => "vendor-1") }));
vi.mock("@/lib/repositories/discount-code-throttle", () => ({
  isDiscountCodeCheckThrottled: vi.fn(),
  recordUnknownDiscountCode: vi.fn(),
}));
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
vi.mock("@/lib/customer-addresses-service", () => ({
  getCustomerAddressService: () => ({ save: vi.fn() }),
}));
vi.mock("@/features/storefront/delivery", () => ({ setDeliveryPostcode: vi.fn() }));
// Not exercised (every form here is COLLECTION), but their real modules import the reference
// database client, which vitest cannot resolve.
vi.mock("@/lib/delivery-eligibility-service", () => ({ getDeliveryEligibility: vi.fn() }));
vi.mock("@/lib/repositories/delivery-refusals", () => ({ recordDeliveryRefusal: vi.fn() }));

import { placeOrderAction } from "@/features/checkout/place-order";
import { CheckoutError } from "@/lib/repositories/orders";
import {
  isDiscountCodeCheckThrottled,
  recordUnknownDiscountCode,
} from "@/lib/repositories/discount-code-throttle";

const THROTTLE_MESSAGE = "Too many code attempts. Please try again in a minute.";

function collectionForm(discountCode: string | null): FormData {
  const form = new FormData();
  form.set("fulfilmentMethod", "COLLECTION");
  form.set("recipientName", "Test Shopper");
  form.set("phone", "07000000000");
  if (discountCode !== null) form.set("discountCode", discountCode);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(isDiscountCodeCheckThrottled).mockResolvedValue(false);
  vi.mocked(recordUnknownDiscountCode).mockResolvedValue(undefined);
  m.createOrder.mockResolvedValue({
    orderNumber: "AHD-1",
    redirectUrl: "/pay",
    confirmationToken: "t",
  });
});

describe("placeOrderAction — discount-code throttle (#988 R23)", () => {
  it("refuses a throttled caller who submitted a code, without placing the order", async () => {
    vi.mocked(isDiscountCodeCheckThrottled).mockResolvedValueOnce(true);

    const state = await placeOrderAction({ error: null }, collectionForm("GUESS1"));

    expect(state).toEqual({ error: THROTTLE_MESSAGE });
    expect(m.createOrder).not.toHaveBeenCalled();
    expect(isDiscountCodeCheckThrottled).toHaveBeenCalledWith({}, "vendor-1", "203.0.113.7");
  });

  it("records one attempt when the order is refused for an UNKNOWN code", async () => {
    m.createOrder.mockRejectedValueOnce(
      new CheckoutError("DISCOUNT_CODE", "That discount code isn't recognised.", "UNKNOWN"),
    );

    const state = await placeOrderAction({ error: null }, collectionForm("GUESS2"));

    expect(state).toEqual({ error: "That discount code isn't recognised." });
    expect(recordUnknownDiscountCode).toHaveBeenCalledTimes(1);
    expect(recordUnknownDiscountCode).toHaveBeenCalledWith({}, "vendor-1", "203.0.113.7");
  });

  it("does not record any other CheckoutError", async () => {
    m.createOrder.mockRejectedValueOnce(
      new CheckoutError("DISCOUNT_CODE", "That discount code has expired.", "EXPIRED"),
    );
    await placeOrderAction({ error: null }, collectionForm("OLDCODE"));

    m.createOrder.mockRejectedValueOnce(new CheckoutError("CART_EMPTY", "Your cart is empty."));
    await placeOrderAction({ error: null }, collectionForm("WELCOME5"));

    expect(recordUnknownDiscountCode).not.toHaveBeenCalled();
  });

  it("does not consult the throttle when no code was submitted", async () => {
    await placeOrderAction({ error: null }, collectionForm(null));
    await placeOrderAction({ error: null }, collectionForm("   "));

    expect(isDiscountCodeCheckThrottled).not.toHaveBeenCalled();
    expect(m.createOrder).toHaveBeenCalledTimes(2);
    expect(m.createOrder.mock.calls[0][0].discountCode).toBeNull();
  });

  it("passes the submitted code through to the order", async () => {
    await placeOrderAction({ error: null }, collectionForm("WELCOME5"));
    expect(m.createOrder.mock.calls[0][0].discountCode).toBe("WELCOME5");
    expect(m.redirect).toHaveBeenCalledWith("/pay");
  });
});

describe("placeOrderAction — throttle fails open (#988 R24)", () => {
  it("places the order, and logs, when the throttle check throws", async () => {
    vi.mocked(isDiscountCodeCheckThrottled).mockRejectedValueOnce(new Error("db down"));

    await placeOrderAction({ error: null }, collectionForm("WELCOME5"));

    expect(m.createOrder).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toMatch(/^Discount throttle:/);
  });

  it("still answers the shopper, and logs, when recording throws", async () => {
    vi.mocked(recordUnknownDiscountCode).mockRejectedValueOnce(new Error("db down"));
    m.createOrder.mockRejectedValueOnce(
      new CheckoutError("DISCOUNT_CODE", "That discount code isn't recognised.", "UNKNOWN"),
    );

    const state = await placeOrderAction({ error: null }, collectionForm("GUESS3"));

    expect(state).toEqual({ error: "That discount code isn't recognised." });
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toMatch(/^Discount throttle:/);
  });
});
