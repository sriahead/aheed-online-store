import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runPaymentSweep,
  DEFAULT_LONG_CUTOFF_MS,
  type SweepDeps,
  type SweepConfig,
} from "@/lib/payment-sweep";
import type { RetrievedSession } from "@/lib/payments";
import type { PaymentBinding, StalePendingOrder } from "@/lib/repositories/orders";

/**
 * NOTE THE ABSENCE OF `vi.mock` (P9.2, #618).
 *
 * Every other repository-adjacent suite in this repo has to mock `@/lib/db` and
 * `@/lib/config` before it can even import the module under test, because those
 * reach `@prisma/client/wasm` and `getCloudflareContext()`. `lib/payment-sweep.ts`
 * needs none of that: its only imports are type-only and therefore erased, and
 * every dependency arrives as a parameter.
 *
 * That is not a stylistic detail — it is the evidence for R18. If this file ever
 * needs a mock to load, the sweep has started resolving something itself and the
 * decision table below has stopped being testable in isolation.
 */

const NOW = new Date("2026-09-06T12:00:00.000Z");

/** Comfortably inside the candidate window, nowhere near the long cutoff. */
const RECENT = new Date(NOW.getTime() - 60 * 60 * 1000);
/** Older than the 7-day long cutoff. */
const ANCIENT = new Date(NOW.getTime() - DEFAULT_LONG_CUTOFF_MS - 60 * 60 * 1000);

const VENDOR = "v-aheed";

interface Harness {
  deps: SweepDeps;
  retrieveSession: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
  cancelUnpaid: ReturnType<typeof vi.fn>;
  sendConfirmation: ReturnType<typeof vi.fn>;
}

function session(overrides: Partial<RetrievedSession> = {}): RetrievedSession {
  return {
    id: "cs_test_from_provider",
    paymentStatus: "unpaid",
    status: "open",
    amountTotal: 4321,
    currency: "gbp",
    ...overrides,
  };
}

function order(overrides: Partial<StalePendingOrder> = {}): StalePendingOrder {
  return {
    orderNumber: "AH-1001",
    createdAt: RECENT,
    providerReference: "cs_test_stored",
    ...overrides,
  };
}

function harness(candidates: StalePendingOrder[], sessionResult?: RetrievedSession): Harness {
  const retrieveSession = vi.fn(async () => sessionResult ?? session());
  const confirm = vi.fn(async () => ({ ok: true as const }));
  const fail = vi.fn(async () => ({ ok: true as const }));
  const cancelUnpaid = vi.fn(async () => true);
  const sendConfirmation = vi.fn(async () => {});

  return {
    retrieveSession,
    confirm,
    fail,
    cancelUnpaid,
    sendConfirmation,
    deps: {
      payments: { retrieveSession },
      orders: { confirm, fail, cancelUnpaid },
      listVendorIds: async () => [VENDOR],
      listCandidates: async () => candidates,
      sendConfirmation,
      provider: "stripe",
      now: () => NOW,
    },
  };
}

describe("runPaymentSweep — the decision table", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("R19: confirms a paid session, binding to the PROVIDER's values not the order's", async () => {
    const h = harness(
      [order()],
      session({
        id: "cs_test_from_provider",
        paymentStatus: "paid",
        status: "complete",
        amountTotal: 9999,
        currency: "gbp",
      }),
    );

    const summary = await runPaymentSweep(h.deps);

    expect(h.confirm).toHaveBeenCalledTimes(1);
    const binding = h.confirm.mock.calls[0][1] as PaymentBinding;
    // Deliberately different from the stored reference the candidate carried: if
    // the code read the order row instead of the provider's answer, this fails.
    expect(binding.providerReference).toBe("cs_test_from_provider");
    expect(binding.amountPence).toBe(9999);
    expect(binding.currency).toBe("gbp");
    expect(binding.provider).toBe("stripe");
    expect(summary).toMatchObject({ scanned: 1, confirmed: 1, released: 0 });
  });

  it("R20: releases an unpaid session the provider has expired", async () => {
    const h = harness([order()], session({ paymentStatus: "unpaid", status: "expired" }));

    const summary = await runPaymentSweep(h.deps);

    expect(h.fail).toHaveBeenCalledTimes(1);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ released: 1, deferred: 0 });
  });

  it("R21: defers an open session and never releases it on age alone", async () => {
    const h = harness([order()], session({ paymentStatus: "unpaid", status: "open" }));
    const summary = await runPaymentSweep(h.deps);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.fail).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ scanned: 1, deferred: 1 });

    // The same session, on an order far older than the long cutoff. An open
    // session means the shopper can still pay, so age must not change anything.
    const old = harness([order({ createdAt: ANCIENT })], session({ status: "open" }));
    const oldSummary = await runPaymentSweep(old.deps);
    expect(old.fail).not.toHaveBeenCalled();
    expect(old.cancelUnpaid).not.toHaveBeenCalled();
    expect(oldSummary).toMatchObject({ deferred: 1, released: 0 });
  });

  it("R21a: defers a complete-but-unpaid session, then releases it past the long cutoff", async () => {
    // An async payment method whose outcome webhook never arrived. Ambiguous
    // while recent — it may still be settling.
    const recent = harness([order()], session({ paymentStatus: "unpaid", status: "complete" }));
    const recentSummary = await runPaymentSweep(recent.deps);
    expect(recent.fail).not.toHaveBeenCalled();
    expect(recentSummary).toMatchObject({ deferred: 1 });

    // Past the long cutoff it cannot still be settling. Releasing here is the
    // regression guard against deferring an async failure forever.
    const aged = harness(
      [order({ createdAt: ANCIENT })],
      session({ paymentStatus: "unpaid", status: "complete" }),
    );
    const agedSummary = await runPaymentSweep(aged.deps);
    expect(aged.fail).toHaveBeenCalledTimes(1);
    expect(agedSummary).toMatchObject({ released: 1, deferred: 0 });
  });

  it("R22: a provider outage transitions nothing and does not stop the run", async () => {
    const h = harness([
      order({ orderNumber: "AH-1", providerReference: "cs_1" }),
      order({ orderNumber: "AH-2", providerReference: "cs_2" }),
      order({ orderNumber: "AH-3", providerReference: "cs_3" }),
    ]);
    h.retrieveSession
      .mockRejectedValueOnce(new Error("stripe unreachable"))
      .mockResolvedValueOnce(session({ paymentStatus: "unpaid", status: "expired" }))
      .mockResolvedValueOnce(session({ paymentStatus: "unpaid", status: "expired" }));

    const summary = await runPaymentSweep(h.deps);

    expect(summary.unresolved).toBe(1);
    // The other two were still processed — an outage on one order must not
    // abandon the rest of the batch.
    expect(h.fail).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ scanned: 3, released: 2 });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("R24: never asks about an order with no stored session, and only releases it when ancient", async () => {
    const recent = harness([order({ providerReference: null })]);
    const recentSummary = await runPaymentSweep(recent.deps);
    expect(recent.retrieveSession).not.toHaveBeenCalled();
    expect(recent.cancelUnpaid).not.toHaveBeenCalled();
    expect(recentSummary).toMatchObject({ deferred: 1 });

    const aged = harness([order({ providerReference: null, createdAt: ANCIENT })]);
    const agedSummary = await runPaymentSweep(aged.deps);
    expect(aged.retrieveSession).not.toHaveBeenCalled();
    // No binding is constructible, so this must go through the no-binding path.
    expect(aged.cancelUnpaid).toHaveBeenCalledTimes(1);
    expect(aged.fail).not.toHaveBeenCalled();
    expect(agedSummary).toMatchObject({ released: 1 });
  });

  it("R25: stops issuing provider calls once the batch cap is reached", async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      order({ orderNumber: `AH-${i}`, providerReference: `cs_${i}` }),
    );
    const h = harness(many, session({ paymentStatus: "unpaid", status: "open" }));
    const config: SweepConfig = {
      candidateCutoffMs: 30 * 60 * 1000,
      longCutoffMs: DEFAULT_LONG_CUTOFF_MS,
      batchCap: 4,
    };

    const summary = await runPaymentSweep(h.deps, config);

    expect(h.retrieveSession).toHaveBeenCalledTimes(4);
    expect(summary.scanned).toBe(4);
  });

  it("R26: emails only when the confirm actually performed the transition", async () => {
    const ok = harness([order()], session({ paymentStatus: "paid", status: "complete" }));
    await runPaymentSweep(ok.deps);
    expect(ok.sendConfirmation).toHaveBeenCalledTimes(1);

    const refused = harness([order()], session({ paymentStatus: "paid", status: "complete" }));
    refused.confirm.mockResolvedValue({ ok: false, reason: "binding-mismatch" });
    const summary = await runPaymentSweep(refused.deps);
    expect(refused.sendConfirmation).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ confirmed: 0, unresolved: 1 });
  });

  it("R33: is loud about a binding refusal and silent about routine work", async () => {
    const refused = harness([order()], session({ paymentStatus: "paid", status: "complete" }));
    refused.confirm.mockResolvedValue({ ok: false, reason: "binding-mismatch" });
    await runPaymentSweep(refused.deps);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockClear();

    // A duplicate delivery resolved the order between the candidate query and
    // the transition. Normal — the same rule the webhook route applies.
    const raced = harness([order()], session({ paymentStatus: "paid", status: "complete" }));
    raced.confirm.mockResolvedValue({ ok: false, reason: "already-processed" });
    await runPaymentSweep(raced.deps);
    expect(errorSpy).not.toHaveBeenCalled();

    // A routine release, a deferral, and a run with no candidates at all.
    const released = harness([order()], session({ status: "expired" }));
    await runPaymentSweep(released.deps);
    const deferred = harness([order()], session({ status: "open" }));
    await runPaymentSweep(deferred.deps);
    const empty = harness([]);
    const emptySummary = await runPaymentSweep(empty.deps);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(emptySummary).toMatchObject({ scanned: 0, unresolved: 0 });
  });

  it("R32: reports counts across every vendor it swept", async () => {
    const h = harness([order()], session({ status: "expired" }));
    h.deps.listVendorIds = async () => ["v-aheed", "v-srimart"];

    const summary = await runPaymentSweep(h.deps);

    expect(Object.keys(summary).sort()).toEqual([
      "confirmed",
      "deferred",
      "released",
      "scanned",
      "unresolved",
    ]);
    // One candidate returned per vendor by the stub, so both were visited.
    expect(summary.scanned).toBe(2);
  });
});
