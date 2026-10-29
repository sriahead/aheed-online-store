import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Every place that writes a job activity marker (#1324): checkout (R14), the
 * sweep's end-of-run answer (R15), staff Retry (R16) and the handled-error path
 * (R17). The marker module is mocked so each test sees exactly which call was
 * made; its own behaviour is `tests/job-signals.test.ts`.
 */

const signals = vi.hoisted(() => ({
  markPaymentSweepDue: vi.fn(async (_at: Date) => {}),
  setPaymentSweepDue: vi.fn(async (_at: Date | null) => {}),
  markErrorEvent: vi.fn(async (_now: Date) => {}),
}));
vi.mock("@/lib/job-signals", () => signals);

const repo = vi.hoisted(() => ({
  placeOrder: vi.fn(),
  findNextPaymentSweepDueAt: vi.fn(),
}));
vi.mock("@/lib/repositories/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/orders")>()),
  placeOrder: repo.placeOrder,
  findNextPaymentSweepDueAt: repo.findNextPaymentSweepDueAt,
}));

vi.mock("@/lib/db", () => ({ getPrisma: () => ({}), getPrismaWs: () => ({}) }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: async () => "v-aheed" }));
vi.mock("@/lib/repositories/vendor", () => ({
  listActiveVendorIds: async () => ["v-aheed", "v-srimart"],
}));

const sweep = vi.hoisted(() => ({ runPaymentSweep: vi.fn() }));
vi.mock("@/lib/payment-sweep", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payment-sweep")>()),
  runPaymentSweep: sweep.runPaymentSweep,
}));

const rearm = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/payment-reconciliation-service", () => ({
  getPaymentReconciliationService: () => ({ rearm }),
}));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: async () => ({ ok: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const errorRepo = vi.hoisted(() => ({ recordErrorEvent: vi.fn() }));
vi.mock("@/lib/repositories/error-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/error-events")>()),
  recordErrorEvent: errorRepo.recordErrorEvent,
}));

const { getOrderRepository } = await import("@/lib/orders-service");
const { getPaymentSweepService } = await import("@/lib/payment-sweep-service");
const { retryReconciliation } = await import("@/features/payments/retry-reconciliation");
const { recordHandledErrorEvent } = await import("@/lib/error-events-service");

const SUMMARY = {
  scanned: 0,
  confirmed: 0,
  released: 0,
  deferred: 0,
  unresolved: 0,
  exhausted: 0,
  skipped: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("R14 — checkout marks the sweep due 40 minutes ahead", () => {
  it("after placeOrder succeeds", async () => {
    repo.placeOrder.mockResolvedValueOnce({ orderNumber: "AHD-1" });
    const before = Date.now();
    await getOrderRepository().createOrder({} as never);
    expect(signals.markPaymentSweepDue).toHaveBeenCalledTimes(1);
    const at = signals.markPaymentSweepDue.mock.calls[0][0].getTime();
    expect(Math.abs(at - (before + 40 * 60 * 1000))).toBeLessThan(5000);
  });

  it("not when placeOrder throws", async () => {
    repo.placeOrder.mockRejectedValueOnce(new Error("cart empty"));
    await expect(getOrderRepository().createOrder({} as never)).rejects.toThrow();
    expect(signals.markPaymentSweepDue).not.toHaveBeenCalled();
  });
});

describe("R15 — the sweep writes when it next has work", () => {
  it("writes the earliest due instant across vendors and returns it", async () => {
    sweep.runPaymentSweep.mockResolvedValueOnce(SUMMARY);
    repo.findNextPaymentSweepDueAt
      .mockResolvedValueOnce(new Date("2026-10-28T13:00:00Z"))
      .mockResolvedValueOnce(new Date("2026-10-28T12:40:00Z"));
    const result = await getPaymentSweepService().run();
    expect(signals.setPaymentSweepDue).toHaveBeenCalledWith(new Date("2026-10-28T12:40:00Z"));
    expect(result).toEqual({ ...SUMMARY, nextDueAt: "2026-10-28T12:40:00.000Z" });
  });

  it("deletes the marker when no vendor has anything pending", async () => {
    sweep.runPaymentSweep.mockResolvedValueOnce(SUMMARY);
    repo.findNextPaymentSweepDueAt.mockResolvedValue(null);
    const result = await getPaymentSweepService().run();
    expect(signals.setPaymentSweepDue).toHaveBeenCalledWith(null);
    expect(result.nextDueAt).toBeNull();
  });
});

describe("R16 — staff Retry marks the sweep due now", () => {
  it("after rearm completes", async () => {
    const order: string[] = [];
    rearm.mockImplementationOnce(async () => void order.push("rearm"));
    signals.markPaymentSweepDue.mockImplementationOnce(async () => void order.push("mark"));
    const form = new FormData();
    form.set("orderNumber", "AHD-1");
    await retryReconciliation(form);
    expect(order).toEqual(["rearm", "mark"]);
  });
});

describe("R17 — a handled error marks the scheduler", () => {
  it("when the write succeeds", async () => {
    errorRepo.recordErrorEvent.mockResolvedValueOnce(undefined);
    await recordHandledErrorEvent({ message: "x" } as never);
    expect(signals.markErrorEvent).toHaveBeenCalledTimes(1);
  });

  it("when the write fails, and the failure still propagates", async () => {
    errorRepo.recordErrorEvent.mockRejectedValueOnce(new Error("db down"));
    await expect(recordHandledErrorEvent({ message: "x" } as never)).rejects.toThrow("db down");
    expect(signals.markErrorEvent).toHaveBeenCalledTimes(1);
  });
});
