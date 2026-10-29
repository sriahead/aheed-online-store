import { describe, it, expect, vi, beforeEach } from "vitest";
import { ORDER_STATUSES, PAID_STATUSES } from "@/lib/order-status";

/**
 * `getPaymentCheckService().resendConfirmation` (#1324 R29, service half): an
 * "order confirmed" email goes only to a paid order, exactly once, with a log
 * line staff can find in `wrangler tail`.
 */

const state = vi.hoisted(() => ({ status: "CONFIRMED" as string | null }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}), getPrismaWs: () => ({}) }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: async () => "v-aheed" }));
vi.mock("@/lib/repositories/orders", () => ({
  findOrderPaymentState: async (_p: unknown, _v: string, orderNumber: string) =>
    state.status === null ? null : { orderNumber, status: state.status, providerReference: null },
}));
vi.mock("@/lib/orders-service", () => ({
  getWebhookOrderService: () => ({
    findOrder: async (orderNumber: string) => ({ orderNumber }),
    confirm: vi.fn(),
  }),
}));
const sendOrderConfirmationEmail = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/features/checkout/send-confirmation", () => ({ sendOrderConfirmationEmail }));
vi.mock("@/lib/payments", () => ({
  getPaymentService: vi.fn(),
  STRIPE_PAYMENT_PROVIDER: "stripe",
}));

const { getPaymentCheckService } = await import("@/lib/payment-check-service");

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("resendConfirmation (R29)", () => {
  const unpaid = ORDER_STATUSES.filter((s) => !PAID_STATUSES.includes(s));

  it.each(unpaid)("sends nothing for %s", async (status) => {
    state.status = status;
    await expect(getPaymentCheckService().resendConfirmation("AHD-1")).resolves.toEqual({
      kind: "not-paid",
    });
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  it.each([...PAID_STATUSES])("sends once and logs for %s", async (status) => {
    state.status = status;
    await expect(getPaymentCheckService().resendConfirmation("AHD-1")).resolves.toEqual({
      kind: "sent",
    });
    expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls.map((c: unknown[]) => String(c[0]))).toContain(
      "confirmation email resent by staff order=AHD-1",
    );
  });

  it("returns not-found for an order outside this vendor", async () => {
    state.status = null;
    await expect(getPaymentCheckService().resendConfirmation("AHD-1")).resolves.toEqual({
      kind: "not-found",
    });
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });
});
