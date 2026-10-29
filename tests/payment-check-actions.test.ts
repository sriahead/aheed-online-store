import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PaymentCheckResult } from "@/lib/payment-check-service";

/**
 * The two callers of the single-order payment check (#1324): the shopper's
 * return-page action (R23) and the staff order page's actions (R27–R28, and the
 * action half of R29). The check service is mocked; its decision table is
 * `tests/payment-check.test.ts`.
 */

const service = vi.hoisted(() => ({
  check: vi.fn(async (_orderNumber: string): Promise<PaymentCheckResult> => ({
    kind: "not-pending",
  })),
  resendConfirmation: vi.fn(async (_orderNumber: string) => ({ kind: "sent" }) as const),
}));
const getPaymentCheckService = vi.hoisted(() => vi.fn(() => service));
vi.mock("@/lib/payment-check-service", () => ({ getPaymentCheckService }));

const viewer = vi.hoisted(() => ({ order: null as unknown, userId: null as string | null }));
const getByOrderNumber = vi.hoisted(() => vi.fn(async () => viewer.order));
vi.mock("@/lib/orders-service", () => ({ getOrderRepository: () => ({ getByOrderNumber }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  getAuth: async () => ({
    api: { getSession: async () => (viewer.userId ? { user: { id: viewer.userId } } : null) },
  }),
}));

const rbac = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; status?: number } }));
const requireVendorRole = vi.hoisted(() => vi.fn(async () => rbac.result));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { checkMyPayment } = await import("@/features/checkout/check-my-payment");
const { checkPaymentNow, resendConfirmationEmail } =
  await import("@/features/orders/staff-payment-actions");
const { initialStaffPaymentFormState } = await import("@/lib/staff-payment-form");

const form = (orderNumber = "AHD-1") => {
  const f = new FormData();
  f.set("orderNumber", orderNumber);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  viewer.order = { orderNumber: "AHD-1", status: "PENDING_PAYMENT" };
  viewer.userId = null;
  rbac.result = { ok: true };
});

describe("checkMyPayment (R23)", () => {
  it("asks nothing when the viewer cannot see the order", async () => {
    viewer.order = null;
    await expect(checkMyPayment("AHD-1", "wrong-token")).resolves.toEqual({ confirmed: false });
    expect(getPaymentCheckService).not.toHaveBeenCalled();
  });

  it("authorizes with the viewer and the token, as the page does", async () => {
    viewer.userId = "u-1";
    await checkMyPayment("AHD-1", "tok");
    expect(getByOrderNumber).toHaveBeenCalledWith("AHD-1", "u-1", "tok");
  });

  it("returns confirmed:true only for a confirmed outcome, and nothing else", async () => {
    const outcomes: PaymentCheckResult[] = [
      { kind: "confirmed" },
      { kind: "not-found" },
      { kind: "not-pending" },
      { kind: "no-session" },
      { kind: "provider-error" },
      { kind: "not-paid", sessionStatus: "open", paymentStatus: "unpaid" },
      { kind: "refused", reason: "binding-mismatch" },
    ];
    for (const outcome of outcomes) {
      service.check.mockResolvedValueOnce(outcome);
      const result = await checkMyPayment("AHD-1", "tok");
      expect(result).toEqual({ confirmed: outcome.kind === "confirmed" });
      expect(Object.keys(result)).toEqual(["confirmed"]);
    }
  });
});

describe("staff payment actions — role gate (R27)", () => {
  it.each([401, 403])("refuse with status %i before any lookup", async (status) => {
    rbac.result = { ok: false, status };
    const check = await checkPaymentNow(initialStaffPaymentFormState, form());
    const resend = await resendConfirmationEmail(initialStaffPaymentFormState, form());
    expect(check.tone).toBe("error");
    expect(resend.tone).toBe("error");
    expect(getPaymentCheckService).not.toHaveBeenCalled();
    expect(requireVendorRole).toHaveBeenCalledWith("ADMIN");
  });
});

describe("checkPaymentNow (R28)", () => {
  it("gives a distinct, non-empty message for each of the seven outcomes", async () => {
    const outcomes: PaymentCheckResult[] = [
      { kind: "not-found" },
      { kind: "not-pending" },
      { kind: "no-session" },
      { kind: "provider-error" },
      { kind: "not-paid", sessionStatus: "expired", paymentStatus: "unpaid" },
      { kind: "confirmed" },
      { kind: "refused", reason: "binding-mismatch" },
    ];
    const messages = new Set<string>();
    for (const outcome of outcomes) {
      service.check.mockResolvedValueOnce(outcome);
      const state = await checkPaymentNow(initialStaffPaymentFormState, form());
      expect(state.message).toBeTruthy();
      messages.add(state.message as string);
      if (outcome.kind === "not-paid") {
        expect(state.message).toContain("expired");
        expect(state.message).toContain("unpaid");
      }
    }
    expect(messages.size).toBe(7);
  });

  it("checks the order number from the form", async () => {
    await checkPaymentNow(initialStaffPaymentFormState, form("AHD-99"));
    expect(service.check).toHaveBeenCalledWith("AHD-99");
  });
});

describe("resendConfirmationEmail (R29, action half)", () => {
  it("never claims delivery", async () => {
    for (const kind of ["sent", "not-paid", "not-found"] as const) {
      service.resendConfirmation.mockResolvedValueOnce({ kind } as never);
      const state = await resendConfirmationEmail(initialStaffPaymentFormState, form());
      expect(state.message).toBeTruthy();
      expect(state.message?.toLowerCase()).not.toContain("delivered");
    }
  });
});
