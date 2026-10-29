import { describe, it, expect, vi } from "vitest";
import { checkOrderPayment, type PaymentCheckDeps } from "@/lib/payment-check";
import type { RetrievedSession } from "@/lib/payments";

/**
 * The single-order payment check (#1324, R21). Like `tests/payment-sweep.test.ts`
 * this needs no `vi.mock`: every dependency is a parameter.
 */

const SESSION: RetrievedSession = {
  id: "cs_test_123",
  paymentStatus: "paid",
  status: "complete",
  amountTotal: 2349,
  currency: "gbp",
};

function deps(overrides: Partial<PaymentCheckDeps> = {}) {
  return {
    retrieveSession: vi.fn(async () => SESSION),
    confirm: vi.fn(async () => ({ ok: true }) as const),
    sendConfirmation: vi.fn(async () => {}),
    provider: "stripe",
    ...overrides,
  };
}

const PENDING = {
  orderNumber: "AHD-20261028-ABC123",
  status: "PENDING_PAYMENT" as const,
  providerReference: "cs_test_123",
};

describe("checkOrderPayment (R21)", () => {
  it("not-pending: asks the provider nothing", async () => {
    const d = deps();
    await expect(checkOrderPayment(d, { ...PENDING, status: "CONFIRMED" })).resolves.toEqual({
      kind: "not-pending",
    });
    expect(d.retrieveSession).not.toHaveBeenCalled();
  });

  it("no-session: asks the provider nothing", async () => {
    const d = deps();
    await expect(checkOrderPayment(d, { ...PENDING, providerReference: null })).resolves.toEqual({
      kind: "no-session",
    });
    expect(d.retrieveSession).not.toHaveBeenCalled();
  });

  it("provider-error: confirms nothing", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () => {
        throw new Error("stripe down");
      }),
    });
    await expect(checkOrderPayment(d, PENDING)).resolves.toEqual({ kind: "provider-error" });
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it("not-paid: reports what the provider said and confirms nothing", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () => ({ ...SESSION, paymentStatus: "unpaid", status: "open" })),
    });
    await expect(checkOrderPayment(d, PENDING)).resolves.toEqual({
      kind: "not-paid",
      sessionStatus: "open",
      paymentStatus: "unpaid",
    });
    expect(d.confirm).not.toHaveBeenCalled();
    expect(d.sendConfirmation).not.toHaveBeenCalled();
  });

  it("confirmed: confirms with a binding built from the provider's response, then emails once", async () => {
    const d = deps();
    await expect(checkOrderPayment(d, PENDING)).resolves.toEqual({ kind: "confirmed" });
    expect(d.retrieveSession).toHaveBeenCalledWith("cs_test_123");
    expect(d.confirm).toHaveBeenCalledWith(PENDING.orderNumber, {
      provider: "stripe",
      providerReference: "cs_test_123",
      amountPence: 2349,
      currency: "gbp",
    });
    expect(d.sendConfirmation).toHaveBeenCalledTimes(1);
    expect(d.sendConfirmation).toHaveBeenCalledWith(PENDING.orderNumber);
  });

  it("refused: reports the refusal and sends no email", async () => {
    const d = deps({
      confirm: vi.fn(async () => ({ ok: false, reason: "binding-mismatch" }) as const),
    });
    await expect(checkOrderPayment(d, PENDING)).resolves.toEqual({
      kind: "refused",
      reason: "binding-mismatch",
    });
    expect(d.sendConfirmation).not.toHaveBeenCalled();
  });
});
