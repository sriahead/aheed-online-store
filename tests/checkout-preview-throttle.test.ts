import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The real throttle SERVICE runs (so its fail-open is under test); only its repository, the DB
// client, the tenant and request headers beneath it are mocked.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(() => ({})), getPrismaWs: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn(async () => "v-1") }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "cf-connecting-ip": "203.0.113.7" })),
}));
vi.mock("@/lib/repositories/discount-code-throttle", () => ({
  isDiscountCodeCheckThrottled: vi.fn(),
  recordUnknownDiscountCode: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getAuth: vi.fn(async () => ({ api: { getSession: async () => ({ user: { id: "u-1" } }) } })),
}));
vi.mock("@/lib/cart-identity", () => ({ getCartIdentity: vi.fn(async () => ({ userId: "u-1" })) }));
vi.mock("@/lib/cart-service", () => ({
  getCartRepository: () => ({
    getSummary: async () => ({ lines: [{ id: "line-1" }], mergePending: false }),
  }),
}));
vi.mock("@/lib/vendor-service", () => ({ getCurrentVendorProfile: vi.fn(async () => ({})) }));
vi.mock("@/lib/fulfilment-service", () => ({ getFulfilmentMethod: vi.fn(async () => "DELIVERY") }));
vi.mock("@/lib/delivery-pricing-service", () => ({
  getShopperDeliveryRules: vi.fn(async () => ({
    deliveryFeePence: 0,
    freeDeliveryThresholdPence: null,
  })),
}));
vi.mock("@/lib/order-totals", () => ({
  computeTotals: vi.fn(() => ({ subtotalPence: 3000, deliveryFeePence: 0 })),
}));
const preview = vi.fn();
vi.mock("@/lib/discounts-service", () => ({ getDiscountRepository: () => ({ preview }) }));

const { isDiscountCodeCheckThrottled, recordUnknownDiscountCode } =
  await import("@/lib/repositories/discount-code-throttle");
const { previewCheckoutCode } = await import("@/lib/checkout-preview-service");
const { refusalMessage } = await import("@/lib/discounts");

/**
 * #988 (R20, R21, R24) — the checkout's code preview (Apply, and the referral-cookie pre-fill)
 * refuses a throttled caller without looking the code up, counts only UNKNOWN results, and fails
 * open if the throttle itself breaks.
 */

const THROTTLE_MESSAGE = "Too many code attempts. Please try again in a minute.";
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(isDiscountCodeCheckThrottled).mockReset().mockResolvedValue(false);
  vi.mocked(recordUnknownDiscountCode).mockReset().mockResolvedValue(undefined);
  preview.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("refusalMessage", () => {
  it("R20 has the throttle copy for TOO_MANY_ATTEMPTS", () => {
    expect(refusalMessage("TOO_MANY_ATTEMPTS")).toBe(THROTTLE_MESSAGE);
  });
});

describe("previewCheckoutCode throttle (R21)", () => {
  it("refuses a throttled caller without previewing the code", async () => {
    vi.mocked(isDiscountCodeCheckThrottled).mockResolvedValueOnce(true);

    const result = await previewCheckoutCode("guess1");

    expect(result).toEqual({ code: "GUESS1", ok: false, message: THROTTLE_MESSAGE });
    expect(preview).not.toHaveBeenCalled();
    expect(recordUnknownDiscountCode).not.toHaveBeenCalled();
  });

  it("records one attempt for an UNKNOWN code, keyed on this vendor and IP", async () => {
    preview.mockResolvedValueOnce({ ok: false, reason: "UNKNOWN" });

    const result = await previewCheckoutCode("guess2");

    expect(result).toEqual({
      code: "GUESS2",
      ok: false,
      message: "That discount code isn't recognised.",
    });
    expect(recordUnknownDiscountCode).toHaveBeenCalledTimes(1);
    expect(recordUnknownDiscountCode).toHaveBeenCalledWith({}, "v-1", "203.0.113.7");
  });

  it("does not record any other refusal", async () => {
    preview.mockResolvedValueOnce({ ok: false, reason: "EXPIRED" });
    await previewCheckoutCode("OLDCODE");
    expect(recordUnknownDiscountCode).not.toHaveBeenCalled();
  });

  it("does not record a successful preview", async () => {
    preview.mockResolvedValueOnce({ ok: true, discountPence: 500 });
    const result = await previewCheckoutCode("WELCOME5");
    expect(result).toEqual({ code: "WELCOME5", ok: true, discountPence: 500 });
    expect(recordUnknownDiscountCode).not.toHaveBeenCalled();
  });
});

describe("previewCheckoutCode throttle fails open (R24)", () => {
  it("previews anyway, and logs, when the throttle check throws", async () => {
    vi.mocked(isDiscountCodeCheckThrottled).mockRejectedValueOnce(new Error("db down"));
    preview.mockResolvedValueOnce({ ok: true, discountPence: 500 });

    const result = await previewCheckoutCode("WELCOME5");

    expect(result).toEqual({ code: "WELCOME5", ok: true, discountPence: 500 });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0][0])).toMatch(/^Discount throttle:/);
  });

  it("still answers the shopper, and logs, when recording throws", async () => {
    vi.mocked(recordUnknownDiscountCode).mockRejectedValueOnce(new Error("db down"));
    preview.mockResolvedValueOnce({ ok: false, reason: "UNKNOWN" });

    const result = await previewCheckoutCode("guess3");

    expect(result).toEqual({
      code: "GUESS3",
      ok: false,
      message: "That discount code isn't recognised.",
    });
    expect(String(consoleError.mock.calls[0][0])).toMatch(/^Discount throttle:/);
  });
});
