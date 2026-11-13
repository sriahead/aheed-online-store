import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1552 R2 — the Stripe webhook tells the shopper and the store about a payment failure only for
 * `async_payment_failed`, and only when this delivery performed the cancellation. The signature
 * check and the event parser are replaced, so the route's own branching is what runs.
 */

const fail = vi.fn();
const findOrder = vi.fn();
const notifyOrderEvent = vi.fn();
let event: Record<string, unknown> | null = null;

vi.mock("@/lib/config", () => ({
  getPaymentEnv: () => ({ STRIPE_WEBHOOK_SECRET: "whsec_test" }),
  readOptional: (read: () => unknown) => read(),
}));
vi.mock("@/lib/stripe-webhook", () => ({
  verifyStripeSignature: async () => true,
  parseCheckoutEvent: () => event,
}));
vi.mock("@/lib/orders-service", () => ({
  getWebhookOrderService: () => ({ fail, findOrder, confirm: vi.fn() }),
}));
vi.mock("@/lib/order-notifications-service", () => ({ notifyOrderEvent }));

const { POST } = await import("@/app/api/webhooks/stripe/route");

function post() {
  return POST(
    new Request("https://s.test/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "t=1,v1=x" },
    }),
  );
}

function checkoutEvent(type: string) {
  return {
    type,
    orderNumber: "SHO-1",
    sessionId: "cs_test_1",
    amountTotal: 1000,
    currency: "gbp",
    paymentStatus: "unpaid",
  };
}

describe("Stripe webhook payment failure (#1552 R2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    findOrder.mockResolvedValue({ orderNumber: "SHO-1", vendorId: "v1" });
  });

  it("an async payment failure this delivery cancelled notifies PAYMENT_FAILED once", async () => {
    event = checkoutEvent("checkout.session.async_payment_failed");
    fail.mockResolvedValue({ ok: true });
    expect((await post()).status).toBe(200);
    expect(notifyOrderEvent).toHaveBeenCalledTimes(1);
    expect(notifyOrderEvent).toHaveBeenCalledWith(
      { orderNumber: "SHO-1", vendorId: "v1" },
      "PAYMENT_FAILED",
    );
  });

  it("an expired session releases stock but notifies nobody", async () => {
    event = checkoutEvent("checkout.session.expired");
    fail.mockResolvedValue({ ok: true });
    expect((await post()).status).toBe(200);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(notifyOrderEvent).not.toHaveBeenCalled();
  });

  it.each(["already-processed", "binding-mismatch", "not-found"])(
    "a refused failure (%s), e.g. a Stripe retry, notifies nobody",
    async (reason) => {
      event = checkoutEvent("checkout.session.async_payment_failed");
      fail.mockResolvedValue({ ok: false, reason });
      expect((await post()).status).toBe(200);
      expect(notifyOrderEvent).not.toHaveBeenCalled();
    },
  );
});
