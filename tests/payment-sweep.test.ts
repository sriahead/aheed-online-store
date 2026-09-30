import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runPaymentSweep,
  DEFAULT_SWEEP_CONFIG,
  DEFAULT_LONG_CUTOFF_MS,
  type SweepDeps,
  type SweepSummary,
} from "@/lib/payment-sweep";
import type { RetrievedSession } from "@/lib/payments";
import type {
  ConfirmPaymentResult,
  FailPaymentResult,
  PaymentBinding,
  StalePendingOrder,
} from "@/lib/repositories/orders";
import type {
  ReconciliationOutcome,
  ReconciliationOutcomeRecord,
} from "@/lib/repositories/payment-reconciliations";

/**
 * NOTE THE ABSENCE OF `vi.mock` (#618, kept by #945's R14).
 *
 * Every other repository-adjacent suite in this repo has to mock `@/lib/db` and
 * `@/lib/config` before it can even import the module under test.
 * `lib/payment-sweep.ts` needs none of that: its imports are type-only and
 * erased, and every dependency arrives as a parameter. If this file ever needs a
 * mock to load, the sweep has started resolving something itself and the
 * decision table has stopped being testable in isolation.
 *
 * THE FAKE STORE. `world()` below holds orders and `PaymentReconciliation` rows
 * in memory and applies the same rules the real repository does — claim only a
 * due, unexhausted row; record only while `lastAttemptAt` equals the claim
 * instant; list only due `PENDING_PAYMENT` orders; transition an order only out
 * of `PENDING_PAYMENT`. That is what lets multi-run properties (exhaustion
 * sticks, an interrupted claim resumes, a resolved order is not revisited) be
 * asserted here. It is still a hand-built double: the live rows in
 * `validation.md` (R40–R46) are what prove the real queries behave the same.
 */

const MIN = 60 * 1000;
const NOW = new Date("2026-09-29T12:00:00.000Z");
const RECENT = new Date(NOW.getTime() - 60 * MIN);
const ANCIENT = new Date(NOW.getTime() - DEFAULT_LONG_CUTOFF_MS - 60 * MIN);
const VENDOR = "v-aheed";
const BUYER_EMAIL = "shopper-945@example.test";

type Status = "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED";

interface FakeOrder {
  orderId: string;
  orderNumber: string;
  vendorId: string;
  createdAt: Date;
  providerReference: string | null;
  status: Status;
  buyerEmail: string;
}

interface FakeRow {
  attemptCount: number;
  consecutiveFailures: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date;
  lastOutcome: ReconciliationOutcome | null;
  lastErrorStatus: number | null;
  exhaustedAt: Date | null;
}

/** A session id maps to what the provider returns, or to something it throws. */
type ProviderAnswer = RetrievedSession | { throws: unknown };

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

let seq = 0;
function order(overrides: Partial<FakeOrder> = {}): FakeOrder {
  seq += 1;
  return {
    orderId: `o-${seq}`,
    orderNumber: `AH-${seq}`,
    vendorId: VENDOR,
    createdAt: RECENT,
    providerReference: `cs_stored_${seq}`,
    status: "PENDING_PAYMENT",
    buyerEmail: BUYER_EMAIL,
    ...overrides,
  };
}

function httpError(status: number, message = "Stripe said no") {
  return Object.assign(new Error(message), { status });
}

function world(
  orders: FakeOrder[],
  opts: {
    answer?: ProviderAnswer;
    answers?: Record<string, ProviderAnswer>;
    vendors?: string[];
  } = {},
) {
  const rows = new Map<string, FakeRow>();
  let clock = NOW;

  const retrieveSession = vi.fn(async (sessionId: string): Promise<RetrievedSession> => {
    const answer = opts.answers?.[sessionId] ?? opts.answer ?? session();
    if ("throws" in answer) throw answer.throws;
    return answer;
  });

  const byNumber = (orderNumber: string) => orders.find((o) => o.orderNumber === orderNumber);
  const transition = (orderNumber: string, to: Status): ConfirmPaymentResult => {
    const target = byNumber(orderNumber);
    if (!target) return { ok: false, reason: "not-found" };
    if (target.status !== "PENDING_PAYMENT") return { ok: false, reason: "already-processed" };
    target.status = to;
    return { ok: true };
  };

  const confirm = vi.fn(
    async (orderNumber: string, _binding: PaymentBinding): Promise<ConfirmPaymentResult> =>
      transition(orderNumber, "CONFIRMED"),
  );
  const fail = vi.fn(
    async (
      orderNumber: string,
      _binding: PaymentBinding,
      _reason: string,
    ): Promise<FailPaymentResult> => transition(orderNumber, "CANCELLED"),
  );
  const cancelUnpaid = vi.fn(
    async (_vendorId: string, orderNumber: string, _reason: string): Promise<boolean> =>
      transition(orderNumber, "CANCELLED").ok,
  );
  const sendConfirmation = vi.fn(async (_orderNumber: string): Promise<void> => {});

  const claim = vi.fn(
    async (_vendorId: string, orderId: string, claimedAt: Date, leaseUntil: Date) => {
      const row = rows.get(orderId);
      if (!row) {
        rows.set(orderId, {
          attemptCount: 1,
          consecutiveFailures: 0,
          lastAttemptAt: claimedAt,
          nextAttemptAt: leaseUntil,
          lastOutcome: null,
          lastErrorStatus: null,
          exhaustedAt: null,
        });
        return true;
      }
      if (row.exhaustedAt !== null || row.nextAttemptAt.getTime() > claimedAt.getTime()) {
        return false;
      }
      row.lastAttemptAt = claimedAt;
      row.nextAttemptAt = leaseUntil;
      row.attemptCount += 1;
      return true;
    },
  );

  const record = vi.fn(
    async (
      _vendorId: string,
      orderId: string,
      claimedAt: Date,
      rec: ReconciliationOutcomeRecord,
    ): Promise<boolean> => {
      const row = rows.get(orderId);
      if (!row || row.lastAttemptAt?.getTime() !== claimedAt.getTime()) return false;
      row.lastOutcome = rec.outcome;
      row.consecutiveFailures = rec.consecutiveFailures;
      row.nextAttemptAt = rec.nextAttemptAt;
      row.lastErrorStatus = rec.lastErrorStatus;
      row.exhaustedAt = rec.exhaustedAt;
      return true;
    },
  );

  const listCandidates = vi.fn(
    async (vendorId: string, olderThan: Date, now: Date, limit: number) =>
      orders
        .filter((o) => o.vendorId === vendorId && o.status === "PENDING_PAYMENT")
        .filter((o) => o.createdAt.getTime() < olderThan.getTime())
        .filter((o) => {
          const row = rows.get(o.orderId);
          return !row || (row.exhaustedAt === null && row.nextAttemptAt.getTime() <= now.getTime());
        })
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit)
        .map((o): StalePendingOrder => ({
          orderId: o.orderId,
          orderNumber: o.orderNumber,
          createdAt: o.createdAt,
          providerReference: o.providerReference,
          consecutiveFailures: rows.get(o.orderId)?.consecutiveFailures ?? 0,
        })),
  );

  const vendors = opts.vendors ?? [VENDOR];

  const deps: SweepDeps = {
    payments: { retrieveSession },
    orders: { confirm, fail, cancelUnpaid },
    reconciliation: { claim, record },
    listVendorIds: async () => vendors,
    listCandidates,
    sendConfirmation,
    provider: "stripe",
    now: () => clock,
  };

  return {
    deps,
    rows,
    orders,
    retrieveSession,
    confirm,
    fail,
    cancelUnpaid,
    sendConfirmation,
    claim,
    record,
    setNow: (d: Date) => {
      clock = d;
    },
    /** Seeds a reconciliation row as a previous run would have left it. */
    seed: (orderId: string, row: Partial<FakeRow>) => {
      rows.set(orderId, {
        attemptCount: 1,
        consecutiveFailures: 0,
        lastAttemptAt: new Date(NOW.getTime() - 60 * MIN),
        nextAttemptAt: new Date(NOW.getTime() - MIN),
        lastOutcome: "DEFERRED",
        lastErrorStatus: null,
        exhaustedAt: null,
        ...row,
      });
    },
    run: () => runPaymentSweep(deps),
  };
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

/** Every line the sweep logged, at either level. */
function lines(): string[] {
  return [...logSpy.mock.calls, ...errorSpy.mock.calls].map((call: unknown[]) => String(call[0]));
}
function errorLines(): string[] {
  return errorSpy.mock.calls.map((call: unknown[]) => String(call[0]));
}

beforeEach(() => {
  seq = 0;
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

describe("runPaymentSweep — defaults and claiming", () => {
  it("R15: exports the documented defaults", () => {
    expect(DEFAULT_SWEEP_CONFIG).toEqual({
      candidateCutoffMs: 30 * MIN,
      longCutoffMs: 7 * 24 * 60 * MIN,
      batchCap: 50,
      leaseMs: 10 * MIN,
      deferIntervalMs: 30 * MIN,
      retryBaseMs: 15 * MIN,
      maxRetryableFailures: 8,
    });
  });

  it("R16: claims before asking the provider, and a lost claim does nothing but count as skipped", async () => {
    const w = world([order()], { answer: session({ paymentStatus: "paid", status: "complete" }) });
    w.claim.mockResolvedValue(false);

    const summary = await w.run();

    expect(w.claim).toHaveBeenCalledTimes(1);
    const [, , claimedAt, leaseUntil] = w.claim.mock.calls[0];
    expect(claimedAt).toEqual(NOW);
    expect(leaseUntil).toEqual(new Date(NOW.getTime() + 10 * MIN));
    expect(w.retrieveSession).not.toHaveBeenCalled();
    expect(w.confirm).not.toHaveBeenCalled();
    expect(w.fail).not.toHaveBeenCalled();
    expect(w.cancelUnpaid).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ scanned: 1, skipped: 1 });
  });
});

describe("runPaymentSweep — the decision table", () => {
  it("R17: confirms a paid session with the PROVIDER's binding, emails once, records CONFIRMED", async () => {
    const o = order();
    const w = world([o], {
      answer: session({
        id: "cs_test_from_provider",
        paymentStatus: "paid",
        status: "complete",
        amountTotal: 9999,
        currency: "gbp",
      }),
    });

    const summary = await w.run();

    expect(w.confirm).toHaveBeenCalledTimes(1);
    const binding = w.confirm.mock.calls[0][1];
    // Deliberately different from the stored reference: if the code read the
    // order row instead of the provider's answer, this fails.
    expect(binding).toEqual({
      provider: "stripe",
      providerReference: "cs_test_from_provider",
      amountPence: 9999,
      currency: "gbp",
    });
    expect(w.sendConfirmation).toHaveBeenCalledTimes(1);
    expect(w.rows.get(o.orderId)?.lastOutcome).toBe("CONFIRMED");
    expect(summary).toMatchObject({ scanned: 1, confirmed: 1 });
  });

  it("R18: already-processed from confirm or fail is ALREADY_HANDLED, quiet, unemailed, skipped", async () => {
    const paid = order();
    const w1 = world([paid], { answer: session({ paymentStatus: "paid", status: "complete" }) });
    w1.confirm.mockResolvedValue({ ok: false, reason: "already-processed" });
    const s1 = await w1.run();
    expect(w1.rows.get(paid.orderId)?.lastOutcome).toBe("ALREADY_HANDLED");
    expect(w1.sendConfirmation).not.toHaveBeenCalled();
    expect(s1).toMatchObject({ skipped: 1, confirmed: 0 });

    const expired = order();
    const w2 = world([expired], { answer: session({ status: "expired" }) });
    w2.fail.mockResolvedValue({ ok: false, reason: "already-processed" });
    const s2 = await w2.run();
    expect(w2.rows.get(expired.orderId)?.lastOutcome).toBe("ALREADY_HANDLED");
    expect(s2).toMatchObject({ skipped: 1, released: 0 });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("R19: a refused binding is REFUSED, exhausted, said once, and never retried", async () => {
    const o = order();
    const w = world([o], { answer: session({ paymentStatus: "paid", status: "complete" }) });
    w.confirm.mockResolvedValue({ ok: false, reason: "binding-mismatch" });

    const first = await w.run();

    const row = w.rows.get(o.orderId);
    expect(row?.lastOutcome).toBe("REFUSED");
    expect(row?.exhaustedAt).toEqual(NOW);
    expect(first).toMatchObject({ exhausted: 1, unresolved: 0 });
    expect(errorLines()).toHaveLength(1);
    expect(errorLines()[0]).toContain("event=unrecoverable");
    expect(w.sendConfirmation).not.toHaveBeenCalled();

    // A day later the order is still PENDING_PAYMENT, but exhausted — so it is
    // not a candidate, and no second refusal (and no second refusal row) happens.
    w.setNow(new Date(NOW.getTime() + 24 * 60 * MIN));
    const second = await w.run();
    expect(w.confirm).toHaveBeenCalledTimes(1);
    expect(w.fail).not.toHaveBeenCalled();
    expect(second.scanned).toBe(0);
  });

  it("R20: releases an unpaid session the provider has expired", async () => {
    const o = order();
    const w = world([o], { answer: session({ paymentStatus: "unpaid", status: "expired" }) });

    const summary = await w.run();

    expect(w.fail).toHaveBeenCalledTimes(1);
    expect(w.confirm).not.toHaveBeenCalled();
    expect(w.rows.get(o.orderId)?.lastOutcome).toBe("RELEASED");
    expect(summary).toMatchObject({ released: 1 });
  });

  it("R21: defers an open session 30 minutes, however old the order or long its history", async () => {
    const o = order({ createdAt: ANCIENT });
    const w = world([o], { answer: session({ status: "open" }) });
    w.seed(o.orderId, { attemptCount: 40 });

    const summary = await w.run();

    const row = w.rows.get(o.orderId);
    expect(row?.lastOutcome).toBe("DEFERRED");
    expect(row?.nextAttemptAt).toEqual(new Date(NOW.getTime() + 30 * MIN));
    expect(row?.exhaustedAt).toBeNull();
    expect(w.fail).not.toHaveBeenCalled();
    expect(w.cancelUnpaid).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ deferred: 1, exhausted: 0 });
  });

  it("R22: defers a complete-but-unpaid session while recent, releases it past the long cutoff", async () => {
    const recent = order();
    const w1 = world([recent], { answer: session({ status: "complete" }) });
    await w1.run();
    expect(w1.fail).not.toHaveBeenCalled();
    expect(w1.rows.get(recent.orderId)).toMatchObject({
      lastOutcome: "DEFERRED",
      nextAttemptAt: new Date(NOW.getTime() + 30 * MIN),
    });

    const aged = order({ createdAt: ANCIENT });
    const w2 = world([aged], { answer: session({ status: "complete" }) });
    const summary = await w2.run();
    expect(w2.fail).toHaveBeenCalledTimes(1);
    expect(w2.rows.get(aged.orderId)?.lastOutcome).toBe("RELEASED");
    expect(summary).toMatchObject({ released: 1 });
  });

  it("R23: no stored session is never asked about; deferred to the long cutoff, then cancelled", async () => {
    const recent = order({ providerReference: null });
    const w1 = world([recent]);
    const s1 = await w1.run();
    expect(w1.retrieveSession).not.toHaveBeenCalled();
    expect(w1.cancelUnpaid).not.toHaveBeenCalled();
    expect(w1.rows.get(recent.orderId)).toMatchObject({
      lastOutcome: "DEFERRED",
      nextAttemptAt: new Date(RECENT.getTime() + DEFAULT_LONG_CUTOFF_MS),
    });
    expect(s1).toMatchObject({ deferred: 1 });

    const aged = order({ providerReference: null, createdAt: ANCIENT });
    const w2 = world([aged]);
    const s2 = await w2.run();
    expect(w2.retrieveSession).not.toHaveBeenCalled();
    expect(w2.cancelUnpaid).toHaveBeenCalledTimes(1);
    expect(w2.fail).not.toHaveBeenCalled();
    expect(w2.rows.get(aged.orderId)?.lastOutcome).toBe("RELEASED");
    expect(s2).toMatchObject({ released: 1 });

    const raced = order({ providerReference: null, createdAt: ANCIENT });
    const w3 = world([raced]);
    w3.cancelUnpaid.mockResolvedValue(false);
    const s3 = await w3.run();
    expect(w3.rows.get(raced.orderId)?.lastOutcome).toBe("ALREADY_HANDLED");
    expect(s3).toMatchObject({ skipped: 1, released: 0 });
  });
});

describe("runPaymentSweep — provider failures", () => {
  it("R24: a 400 or 404 is PERMANENT_ERROR, exhausted at once, and never grounds for release", async () => {
    for (const status of [400, 404]) {
      const o = order();
      const w = world([o], { answer: { throws: httpError(status) } });

      const summary = await w.run();

      expect(w.rows.get(o.orderId)).toMatchObject({
        lastOutcome: "PERMANENT_ERROR",
        lastErrorStatus: status,
        exhaustedAt: NOW,
      });
      expect(w.fail).not.toHaveBeenCalled();
      expect(w.cancelUnpaid).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ exhausted: 1, unresolved: 0 });
    }
  });

  it("R25: anything else backs off 15m doubling, and the 8th consecutive failure exhausts", async () => {
    for (let k = 1; k <= 8; k += 1) {
      const o = order();
      const w = world([o], { answer: { throws: httpError(503) } });
      if (k > 1) w.seed(o.orderId, { consecutiveFailures: k - 1, lastOutcome: "RETRYABLE_ERROR" });

      const summary = await w.run();
      const row = w.rows.get(o.orderId);

      expect(row?.lastOutcome).toBe("RETRYABLE_ERROR");
      expect(row?.consecutiveFailures).toBe(k);
      expect(row?.lastErrorStatus).toBe(503);
      if (k < 8) {
        expect(row?.exhaustedAt).toBeNull();
        expect(row?.nextAttemptAt).toEqual(new Date(NOW.getTime() + 15 * MIN * 2 ** (k - 1)));
        expect(summary).toMatchObject({ unresolved: 1, exhausted: 0 });
      } else {
        expect(row?.exhaustedAt).toEqual(NOW);
        expect(summary).toMatchObject({ unresolved: 0, exhausted: 1 });
      }
    }

    // 401/403 mean OUR key is wrong — a store-wide config fault — so they must
    // not exhaust anything; nor may a network failure with no status at all.
    for (const thrown of [
      httpError(401),
      httpError(403),
      httpError(429),
      new Error("fetch failed"),
    ]) {
      const o = order();
      const w = world([o], { answer: { throws: thrown } });
      await w.run();
      expect(w.rows.get(o.orderId)).toMatchObject({
        lastOutcome: "RETRYABLE_ERROR",
        consecutiveFailures: 1,
        exhaustedAt: null,
      });
    }
  });

  it("R26: any definitive provider answer resets the failure count", async () => {
    const o = order();
    const w = world([o], { answer: session({ status: "open" }) });
    w.seed(o.orderId, { consecutiveFailures: 3, lastOutcome: "RETRYABLE_ERROR" });

    await w.run();

    expect(w.rows.get(o.orderId)).toMatchObject({
      lastOutcome: "DEFERRED",
      consecutiveFailures: 0,
    });
  });
});

describe("runPaymentSweep — interruption, fencing, overlap", () => {
  it("R27: records against the claim instant, and a superseded record neither throws nor stops the run", async () => {
    const a = order();
    const b = order();
    const w = world([a, b], { answer: session({ status: "expired" }) });
    w.record.mockResolvedValueOnce(false);

    const summary = await w.run();

    expect(w.claim.mock.calls[0][2]).toEqual(w.record.mock.calls[0][2]);
    expect(w.fail).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ scanned: 2, released: 2 });
    expect(lines().some((line) => line.includes("reason=superseded"))).toBe(true);
  });

  it("R28: an interrupted attempt waits out its lease, then resumes without counting as a failure", async () => {
    const o = order();
    const w = world([o], { answer: { throws: httpError(503) } });
    // A previous run claimed at 11:55 with a 10-minute lease, then died: no
    // outcome recorded, two failures from before still on the row.
    w.seed(o.orderId, {
      attemptCount: 3,
      consecutiveFailures: 2,
      lastAttemptAt: new Date(NOW.getTime() - 5 * MIN),
      nextAttemptAt: new Date(NOW.getTime() + 5 * MIN),
      lastOutcome: null,
    });

    const during = await w.run();
    expect(during.scanned).toBe(0);
    expect(w.retrieveSession).not.toHaveBeenCalled();

    w.setNow(new Date(NOW.getTime() + 6 * MIN));
    await w.run();
    expect(w.retrieveSession).toHaveBeenCalledTimes(1);
    // 2 before the interruption, +1 for this real failure — the interruption
    // itself added nothing.
    expect(w.rows.get(o.orderId)).toMatchObject({ consecutiveFailures: 3, attemptCount: 4 });
  });

  it("R31: a second run does not revisit what the first run resolved", async () => {
    const paid = order({ providerReference: "cs_paid" });
    const expired = order({ providerReference: "cs_expired" });
    const w = world([paid, expired], {
      answers: {
        cs_paid: session({ id: "cs_paid", paymentStatus: "paid", status: "complete" }),
        cs_expired: session({ id: "cs_expired", status: "expired" }),
      },
    });

    await w.run();
    w.setNow(new Date(NOW.getTime() + MIN));
    const second = await w.run();

    expect(second.scanned).toBe(0);
    expect(w.confirm).toHaveBeenCalledTimes(1);
    expect(w.fail).toHaveBeenCalledTimes(1);
    expect(w.cancelUnpaid).not.toHaveBeenCalled();
    expect(w.sendConfirmation).toHaveBeenCalledTimes(1);
  });
});

describe("runPaymentSweep — batching", () => {
  function processedByVendor(w: ReturnType<typeof world>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [orderNumber] of w.fail.mock.calls) {
      const vendor = w.orders.find((o) => o.orderNumber === orderNumber)?.vendorId ?? "?";
      counts[vendor] = (counts[vendor] ?? 0) + 1;
    }
    return counts;
  }

  it("R29: shares the batch cap round-robin across vendors", async () => {
    const even = [
      ...Array.from({ length: 60 }, () => order({ vendorId: "v-a" })),
      ...Array.from({ length: 60 }, () => order({ vendorId: "v-b" })),
    ];
    const w1 = world(even, { answer: session({ status: "expired" }), vendors: ["v-a", "v-b"] });
    await w1.run();
    expect(processedByVendor(w1)).toEqual({ "v-a": 25, "v-b": 25 });

    const lopsided = [
      ...Array.from({ length: 3 }, () => order({ vendorId: "v-a" })),
      ...Array.from({ length: 100 }, () => order({ vendorId: "v-b" })),
    ];
    const w2 = world(lopsided, { answer: session({ status: "expired" }), vendors: ["v-a", "v-b"] });
    await w2.run();
    expect(processedByVendor(w2)).toEqual({ "v-a": 3, "v-b": 47 });
  });

  it("R30: never makes more provider calls than the batch cap", async () => {
    const many = ["v-a", "v-b", "v-c", "v-d"].flatMap((vendorId) =>
      Array.from({ length: 50 }, () => order({ vendorId })),
    );
    const w = world(many, {
      answer: session({ status: "open" }),
      vendors: ["v-a", "v-b", "v-c", "v-d"],
    });

    const summary = await w.run();

    expect(w.retrieveSession).toHaveBeenCalledTimes(50);
    expect(summary.scanned).toBe(50);
  });
});

describe("runPaymentSweep — summary and observability", () => {
  /** One order per behaviour, so a single run exercises every event. */
  function mixedWorld() {
    const orders = [
      order({ providerReference: "cs_paid" }),
      order({ providerReference: "cs_expired" }),
      order({ providerReference: "cs_open" }),
      order({ providerReference: "cs_gone" }),
      order({ providerReference: "cs_flaky" }),
      order({ providerReference: "cs_mismatch" }),
      order({ providerReference: "cs_claimed" }),
    ];
    const w = world(orders, {
      answers: {
        cs_paid: session({ id: "cs_paid", paymentStatus: "paid", status: "complete" }),
        cs_expired: session({ id: "cs_expired", status: "expired" }),
        cs_open: session({ id: "cs_open", status: "open" }),
        cs_gone: { throws: httpError(404, "SECRET-BODY-MARKER no such session") },
        cs_flaky: { throws: httpError(503, "SECRET-BODY-MARKER upstream") },
        cs_mismatch: session({ id: "cs_mismatch", paymentStatus: "paid", status: "complete" }),
        cs_claimed: session({ id: "cs_claimed", status: "expired" }),
      },
    });
    const mismatchNumber = orders[5].orderNumber;
    const realConfirm = w.confirm.getMockImplementation();
    w.confirm.mockImplementation(async (orderNumber, binding) =>
      orderNumber === mismatchNumber
        ? { ok: false, reason: "binding-mismatch" }
        : realConfirm!(orderNumber, binding),
    );
    // The last order is held by an overlapping run.
    w.seed(orders[6].orderId, { nextAttemptAt: new Date(NOW.getTime() - MIN) });
    const claimedId = orders[6].orderId;
    const realClaim = w.claim.getMockImplementation();
    w.claim.mockImplementation(async (vendorId, orderId, claimedAt, leaseUntil) =>
      orderId === claimedId ? false : realClaim!(vendorId, orderId, claimedAt, leaseUntil),
    );
    return w;
  }

  it("R32: reports exactly seven counts, and scanned is the sum of the other six", async () => {
    const summary: SweepSummary = await mixedWorld().run();

    expect(Object.keys(summary).sort()).toEqual([
      "confirmed",
      "deferred",
      "exhausted",
      "released",
      "scanned",
      "skipped",
      "unresolved",
    ]);
    expect(summary).toEqual({
      scanned: 7,
      confirmed: 1,
      released: 1,
      deferred: 1,
      unresolved: 1,
      exhausted: 2,
      skipped: 1,
    });
  });

  it("R33: every line carries the fixed prefix, and every event is emitted", async () => {
    await mixedWorld().run();

    const all = lines();
    for (const line of all) expect(line.startsWith("payment-reconciliation event=")).toBe(true);
    for (const event of [
      "run-started",
      "selected",
      "provider-state",
      "transition",
      "retry-scheduled",
      "retry-exhausted",
      "skipped",
      "unrecoverable",
    ]) {
      expect(
        all.some((line) => line.includes(`event=${event} `) || line.endsWith(`event=${event}`)),
      ).toBe(true);
    }
  });

  it("R34: errors only for provider failure, exhaustion and refusal; routine runs are quiet", async () => {
    await mixedWorld().run();
    const errors = errorLines();
    // cs_gone (exhausted), cs_flaky (retry scheduled), cs_mismatch (unrecoverable).
    expect(errors).toHaveLength(3);
    expect(errors.some((l) => l.includes("event=retry-exhausted"))).toBe(true);
    expect(errors.some((l) => l.includes("event=retry-scheduled"))).toBe(true);
    expect(errors.some((l) => l.includes("event=unrecoverable"))).toBe(true);

    errorSpy.mockClear();

    const done = order({ providerReference: "cs_done" });
    const routine = world(
      [
        order({ providerReference: "cs_paid" }),
        order({ providerReference: "cs_expired" }),
        order({ providerReference: "cs_open" }),
        done,
      ],
      {
        answers: {
          cs_paid: session({ id: "cs_paid", paymentStatus: "paid", status: "complete" }),
          cs_expired: session({ id: "cs_expired", status: "expired" }),
          cs_open: session({ id: "cs_open", status: "open" }),
          cs_done: session({ id: "cs_done", status: "expired" }),
        },
      },
    );
    // A webhook resolved this one between the candidate query and the release.
    routine.fail.mockImplementation(async (orderNumber) =>
      orderNumber === done.orderNumber ? { ok: false, reason: "already-processed" } : { ok: true },
    );
    await routine.run();
    await world([]).run();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("R35: logs no buyer email and no provider response body", async () => {
    await mixedWorld().run();

    for (const line of lines()) {
      expect(line).not.toContain(BUYER_EMAIL);
      expect(line).not.toContain("SECRET-BODY-MARKER");
    }
  });
});
