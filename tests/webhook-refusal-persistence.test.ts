import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #454 — the webhook facade persists a LOUD refusal and stays silent on a
 * duplicate delivery.
 *
 * Mocks the repository layer rather than the database: what is under test is
 * the FACADE's rule about which refusals are worth recording, and its promise
 * that a failure to record one cannot change the webhook's own outcome.
 */

type RefusalResult = { ok: true } | { ok: false; reason: string };

const confirmPayment = vi.fn(async (..._args: unknown[]): Promise<RefusalResult> => ({ ok: true }));
const failPayment = vi.fn(async (..._args: unknown[]): Promise<RefusalResult> => ({ ok: true }));
const findOrderForWebhook = vi.fn(async (..._args: unknown[]) => null);
const recordPaymentBindingRefusal = vi.fn(async (..._args: unknown[]): Promise<void> => undefined);

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({}),
  getPrismaWs: () => ({}),
}));

vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: async () => "vendor-aheed" }));

vi.mock("@/lib/repositories/orders", () => ({
  confirmPayment: (...args: unknown[]) => confirmPayment(...args),
  failPayment: (...args: unknown[]) => failPayment(...args),
  findOrderForWebhook: (...args: unknown[]) => findOrderForWebhook(...args),
  advanceOrderStatus: vi.fn(),
  advanceOrderStatusBulk: vi.fn(),
  cancelUnpaidOrder: vi.fn(),
  countOrdersForStaff: vi.fn(),
  findOrderForGuestLookup: vi.fn(),
  findOrderForStaff: vi.fn(),
  findOrderForUser: vi.fn(),
  findOrderForViewer: vi.fn(),
  getFinancialsForStaff: vi.fn(),
  listOrdersForStaff: vi.fn(),
  listOrdersForUser: vi.fn(),
  placeOrder: vi.fn(),
}));

vi.mock("@/lib/repositories/payment-binding-refusals", () => ({
  recordPaymentBindingRefusal: (...args: unknown[]) => recordPaymentBindingRefusal(...args),
}));

const { getWebhookOrderService } = await import("@/lib/orders-service");

const BINDING = {
  provider: "stripe",
  providerReference: "cs_claimed_9",
  amountPence: 2346,
  currency: "gbp",
};

const ORDER_NUMBER = "AHE-20260902-ABC123";

beforeEach(() => {
  confirmPayment.mockReset();
  failPayment.mockReset();
  recordPaymentBindingRefusal.mockReset();
  recordPaymentBindingRefusal.mockResolvedValue(undefined);
});

describe("confirm — refusal persistence", () => {
  it.each(["unbindable", "not-found", "binding-mismatch"])(
    "records a %s refusal exactly once, with what the event claimed",
    async (reason) => {
      confirmPayment.mockResolvedValue({ ok: false, reason });

      const result = await getWebhookOrderService().confirm(ORDER_NUMBER, BINDING);

      expect(result).toEqual({ ok: false, reason });
      expect(recordPaymentBindingRefusal).toHaveBeenCalledTimes(1);
      const [, input] = recordPaymentBindingRefusal.mock.calls[0] as unknown as [
        unknown,
        Record<string, unknown>,
      ];
      expect(input).toEqual({
        orderNumber: ORDER_NUMBER,
        reason,
        provider: "stripe",
        claimedProviderReference: "cs_claimed_9",
        claimedAmountPence: 2346,
        claimedCurrency: "gbp",
      });
    },
  );

  it("records nothing for already-processed — a duplicate delivery is the system working", async () => {
    confirmPayment.mockResolvedValue({ ok: false, reason: "already-processed" });

    await getWebhookOrderService().confirm(ORDER_NUMBER, BINDING);

    expect(recordPaymentBindingRefusal).not.toHaveBeenCalled();
  });

  it("records nothing on success", async () => {
    confirmPayment.mockResolvedValue({ ok: true });

    const result = await getWebhookOrderService().confirm(ORDER_NUMBER, BINDING);

    expect(result).toEqual({ ok: true });
    expect(recordPaymentBindingRefusal).not.toHaveBeenCalled();
  });
});

describe("fail — refusal persistence", () => {
  it("records a binding-mismatch refusal from the cancellation path too", async () => {
    failPayment.mockResolvedValue({ ok: false, reason: "binding-mismatch" });

    await getWebhookOrderService().fail(ORDER_NUMBER, BINDING, "Checkout session expired.");

    expect(recordPaymentBindingRefusal).toHaveBeenCalledTimes(1);
  });

  it("records nothing for already-processed", async () => {
    failPayment.mockResolvedValue({ ok: false, reason: "already-processed" });

    await getWebhookOrderService().fail(ORDER_NUMBER, BINDING, "Checkout session expired.");

    expect(recordPaymentBindingRefusal).not.toHaveBeenCalled();
  });
});

describe("persistence failure cannot change the webhook's outcome", () => {
  it("still returns the refusal result when recording throws", async () => {
    confirmPayment.mockResolvedValue({ ok: false, reason: "binding-mismatch" });
    recordPaymentBindingRefusal.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    // Must not reject: the route's 200 and its own refusal log both depend on
    // this resolving. A rethrow here would make Stripe retry an event that can
    // never succeed.
    const result = await getWebhookOrderService().confirm(ORDER_NUMBER, BINDING);

    expect(result).toEqual({ ok: false, reason: "binding-mismatch" });
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("still returns ok when recording throws on a path that never records", async () => {
    confirmPayment.mockResolvedValue({ ok: true });
    recordPaymentBindingRefusal.mockRejectedValue(new Error("db down"));

    await expect(getWebhookOrderService().confirm(ORDER_NUMBER, BINDING)).resolves.toEqual({
      ok: true,
    });
  });
});
