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
 * The stranded payment sweep (P9.2, #618), with a memory between runs (#945).
 *
 * `placeOrder` decrements stock inside the order transaction and writes the
 * order `PENDING_PAYMENT`; leaving that state is the webhook's job, exclusively
 * (`lib/order-status.ts` gives `PENDING_PAYMENT` no outbound staff transition at
 * all). When the webhook never arrives, nothing resolves the order: it holds its
 * inventory, its discount-code use and its loyalty redemption indefinitely, and
 * `/staff/payments` cannot show it because that worklist reads binding-refusal
 * rows, which a webhook that never arrived never wrote.
 *
 * EVERY DEPENDENCY IS A PARAMETER, deliberately. This module imports nothing at
 * runtime — every import above is type-only and erased — so its decision table
 * can be exercised by a unit test with no database, no Stripe key, no Worker
 * request context and no `vi.mock` call at all. That is the property that makes
 * the table below actually verifiable rather than merely reviewed;
 * `lib/config.ts` reads `getCloudflareContext()`, so anything that reaches it
 * transitively needs mocking to load, which is exactly what this avoids.
 *
 * THE DECISION TABLE. For each candidate the sweep asks the provider about the
 * order's OWN stored session and acts only on a definitive answer:
 *
 *   paid                  -> confirm, then email                 CONFIRMED
 *   unpaid + expired      -> release (restock, reverse points,   RELEASED
 *                            free the code)
 *   unpaid + open         -> nothing; the shopper can still pay  DEFERRED
 *   unpaid + complete     -> nothing until the long cutoff,      DEFERRED, then RELEASED
 *                            then release
 *   retrieveSession threw -> nothing; classified and backed off  RETRYABLE_ERROR / PERMANENT_ERROR
 *
 * Release is gated on the SESSION'S OWN STATE, never on elapsed time alone. That
 * is what lets the candidate cutoff be short: a 30-minute cutoff cannot cancel
 * anything prematurely, because a session that has not expired yields "do
 * nothing" however old the order is — while a shopper who paid into a lost
 * webhook is rescued within the hour instead of the next day.
 *
 * The `complete` and unpaid row is the one a shorter design gets wrong. Stripe's
 * asynchronous payment methods finish the session BEFORE the money settles, so a
 * lost `async_payment_failed` leaves the session `complete` and `unpaid`
 * forever; a rule keyed only on `expired` would defer such an order on every run
 * until the end of time. It cannot be released on sight either, because
 * `complete` plus `unpaid` is also what a still-settling payment looks like — so
 * it resolves on the long cutoff, the same backstop the no-stored-session case
 * uses.
 *
 * A PROVIDER OUTAGE MUST NOT LOOK LIKE AN ANSWER. `features/payments/reconcile-refusal.ts`
 * states the principle this inherits: "we asked and could not find out" is not
 * "we asked and it was unpaid" — the second authorizes writing the order off,
 * the first does not. So a provider failure transitions nothing. Even a `404`
 * (Stripe has no such session) only stops the retries and surfaces the order to
 * staff; it never releases it.
 *
 * MEMORY BETWEEN RUNS (#945). Every candidate is CLAIMED before the provider is
 * asked anything, and what the attempt concluded is RECORDED on its
 * `PaymentReconciliation` row (see `lib/repositories/payment-reconciliations.ts`
 * for the claim, lease and fence). The candidate query only returns orders that
 * are due, so an order being backed off, or one the sweep gave up on, no longer
 * sits at the head of the oldest-first queue on every tick. Retryable failures
 * back off exponentially and exhaust after a bound; a `400`/`404` or a refused
 * binding exhausts at once — which is also why a refused order writes its
 * `PaymentBindingRefusal` row once rather than on every tick.
 *
 * None of that is the concurrency guarantee: `confirmPayment`, `failPayment`
 * and `releaseOrder` moving an order only out of `PENDING_PAYMENT` still is. A
 * racing webhook, or an overlapping run, gets `already-processed`.
 */

/** Why a release happened, written to the order's own status timeline (R30 of #618). */
const RELEASE_NOTES = {
  expired: "Checkout session expired; released by the scheduled payment sweep.",
  unsettled: "Payment never settled; released by the scheduled payment sweep.",
  noSession: "No payment session was ever created; released by the scheduled payment sweep.",
} as const;

export interface SweepOrderOperations {
  /** #429's bound compare-and-set. Unchanged by this slice; this is a caller. */
  confirm(orderNumber: string, binding: PaymentBinding): Promise<ConfirmPaymentResult>;
  fail(orderNumber: string, binding: PaymentBinding, reason: string): Promise<FailPaymentResult>;
  /**
   * The no-binding release, for an order carrying no session id at all. No
   * `PaymentBinding` is constructible for those, so `fail` would refuse them as
   * `unbindable` by design — this is the only path that can resolve them.
   */
  cancelUnpaid(vendorId: string, orderNumber: string, reason: string): Promise<boolean>;
}

/** The claim-and-record half of `lib/repositories/payment-reconciliations.ts`, bound to a client. */
export interface SweepReconciliationOperations {
  claim(vendorId: string, orderId: string, claimedAt: Date, leaseUntil: Date): Promise<boolean>;
  record(
    vendorId: string,
    orderId: string,
    claimedAt: Date,
    record: ReconciliationOutcomeRecord,
  ): Promise<boolean>;
}

/**
 * Only the READ half of the payment port. Narrowed to one method deliberately:
 * nothing in this module may move money, and a dependency that cannot express
 * `createPayment` cannot accidentally grow a call to it.
 */
interface RetrievedSessionSource {
  retrieveSession(sessionId: string): Promise<RetrievedSession>;
}

export interface SweepDeps {
  payments: RetrievedSessionSource;
  orders: SweepOrderOperations;
  reconciliation: SweepReconciliationOperations;
  listVendorIds(): Promise<string[]>;
  /** Due candidates only: never swept, or not exhausted with `nextAttemptAt` at or before `now`. */
  listCandidates(
    vendorId: string,
    olderThan: Date,
    now: Date,
    limit: number,
  ): Promise<StalePendingOrder[]>;
  /** Sent only after a confirm that actually performed the transition. */
  sendConfirmation(orderNumber: string): Promise<void>;
  /**
   * The provider name written into the binding. Injected rather than imported so
   * this module keeps its zero-runtime-import property; the service supplies
   * `STRIPE_PAYMENT_PROVIDER`.
   */
  provider: string;
  now(): Date;
}

export interface SweepConfig {
  /** How old an order must be before it is looked at at all. */
  candidateCutoffMs: number;
  /** The backstop for the two cases the provider cannot answer directly. */
  longCutoffMs: number;
  /** Hard ceiling on orders examined per run, bounding provider calls and CPU. */
  batchCap: number;
  /** How far a claim pushes `nextAttemptAt` forward; the retry delay after an interruption. */
  leaseMs: number;
  /** When a still-payable or still-settling order is looked at again. */
  deferIntervalMs: number;
  /** The first retry delay after a retryable failure; each further one doubles it. */
  retryBaseMs: number;
  /** The consecutive retryable failure that exhausts an order instead of rescheduling it. */
  maxRetryableFailures: number;
}

/**
 * Past any live checkout interaction, but short enough that a stranded paid
 * order is rescued within the hour. Safe to keep short only because release is
 * gated on session state rather than age.
 */
export const DEFAULT_CANDIDATE_CUTOFF_MS = 30 * 60 * 1000;

/**
 * Comfortably past Stripe's default 24-hour Checkout Session expiry — this app
 * sets no `expires_at` — so nothing behind it can still be paid.
 */
export const DEFAULT_LONG_CUTOFF_MS = 7 * 24 * 60 * 60 * 1000;

/** A backlog larger than this drains across successive runs rather than in one request. */
export const DEFAULT_BATCH_CAP = 50;

/**
 * Shorter than the 15-minute scheduler tick, so an attempt interrupted by a
 * Worker dying is picked up again by the very next tick.
 */
export const DEFAULT_LEASE_MS = 10 * 60 * 1000;

/**
 * An open session can still be paid at any moment, and a shopper who paid into
 * a lost webhook is waiting on this — so the recheck stays well inside the hour.
 */
export const DEFAULT_DEFER_INTERVAL_MS = 30 * 60 * 1000;

/**
 * 15 minutes doubling: 15m, 30m, 1h, 2h, 4h, 8h, 16h, then the 8th consecutive
 * failure exhausts. About 31 hours in all — enough to ride out a day-long
 * provider outage with nobody acting.
 */
export const DEFAULT_RETRY_BASE_MS = 15 * 60 * 1000;
export const DEFAULT_MAX_RETRYABLE_FAILURES = 8;

export const DEFAULT_SWEEP_CONFIG: SweepConfig = {
  candidateCutoffMs: DEFAULT_CANDIDATE_CUTOFF_MS,
  longCutoffMs: DEFAULT_LONG_CUTOFF_MS,
  batchCap: DEFAULT_BATCH_CAP,
  leaseMs: DEFAULT_LEASE_MS,
  deferIntervalMs: DEFAULT_DEFER_INTERVAL_MS,
  retryBaseMs: DEFAULT_RETRY_BASE_MS,
  maxRetryableFailures: DEFAULT_MAX_RETRYABLE_FAILURES,
};

/**
 * One count per candidate, and `scanned` is their sum.
 *
 * - `unresolved` — a retryable provider failure that was rescheduled.
 * - `exhausted` — this run stopped retrying it: a refused binding, a `400`/`404`,
 *   or the last allowed retryable failure.
 * - `skipped` — another run held the claim, or the order had already been
 *   resolved by something else (`already-processed`).
 */
export interface SweepSummary {
  scanned: number;
  confirmed: number;
  released: number;
  deferred: number;
  unresolved: number;
  exhausted: number;
  skipped: number;
}

type SummaryBucket = Exclude<keyof SweepSummary, "scanned">;

/**
 * HTTP statuses that mean retrying the same request can never succeed: the
 * request itself is wrong (`400`) or the session does not exist (`404`).
 *
 * `401`/`403` are deliberately NOT here. They mean our key is wrong — a
 * configuration fault that hits every order at once and heals when the key is
 * fixed. Treating them as permanent would exhaust the whole store's backlog on
 * one bad deploy.
 */
const PERMANENT_HTTP_STATUSES = new Set([400, 404]);

/**
 * Reads a numeric `status` off whatever `retrieveSession` threw. Duck-typed
 * rather than `instanceof PaymentProviderError` because an `instanceof` check
 * needs a runtime import, and this module has none.
 */
function httpStatusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  const status = (error as { status: unknown }).status;
  return typeof status === "number" ? status : null;
}

type LogValue = string | number | null;

/**
 * One structured line per event, greppable in `wrangler tail`, Workers Logs and
 * the local log explorer by its fixed prefix. Identifiers and states only —
 * never a buyer's name, email or address, and never a provider response body
 * (a thrown error's `message` carries Stripe's raw body, so it is not logged).
 */
function emit(level: "log" | "error", event: string, fields: Record<string, LogValue>): void {
  const pairs = Object.entries(fields).map(([key, value]) => `${key}=${value ?? "none"}`);
  console[level](["payment-reconciliation", `event=${event}`, ...pairs].join(" "));
}

interface Attempt {
  vendorId: string;
  order: StalePendingOrder;
  claimedAt: Date;
}

/**
 * Stores the attempt's conclusion. A `false` from the store means the row was
 * re-claimed after this run's lease ran out; the newer attempt owns it, so this
 * one's result is dropped rather than retried.
 */
async function record(
  deps: SweepDeps,
  attempt: Attempt,
  outcome: ReconciliationOutcome,
  fields: Partial<Omit<ReconciliationOutcomeRecord, "outcome">> = {},
): Promise<void> {
  const stored = await deps.reconciliation.record(
    attempt.vendorId,
    attempt.order.orderId,
    attempt.claimedAt,
    {
      outcome,
      consecutiveFailures: fields.consecutiveFailures ?? 0,
      nextAttemptAt: fields.nextAttemptAt ?? attempt.claimedAt,
      lastErrorStatus: fields.lastErrorStatus ?? null,
      exhaustedAt: fields.exhaustedAt ?? null,
    },
  );
  if (!stored) {
    emit("log", "skipped", {
      order: attempt.order.orderNumber,
      reason: "superseded",
      outcome,
    });
  }
}

/**
 * The result of a confirm or fail that did not transition the order.
 * `already-processed` is normal — a webhook or an overlapping run got there
 * first — and stays quiet, mirroring the webhook route's own rule. Anything
 * else is a refused binding that will never self-heal, so it is exhausted at
 * once and said loudly.
 */
async function handleRefusal(
  deps: SweepDeps,
  attempt: Attempt,
  reason: string,
  operation: "confirm" | "fail",
  sessionId: string,
): Promise<SummaryBucket> {
  if (reason === "already-processed") {
    await record(deps, attempt, "ALREADY_HANDLED");
    emit("log", "skipped", { order: attempt.order.orderNumber, reason });
    return "skipped";
  }
  await record(deps, attempt, "REFUSED", { exhaustedAt: attempt.claimedAt });
  emit("error", "unrecoverable", {
    order: attempt.order.orderNumber,
    vendor: attempt.vendorId,
    operation,
    reason,
    session: sessionId,
  });
  return "exhausted";
}

async function handleProviderFailure(
  deps: SweepDeps,
  config: SweepConfig,
  attempt: Attempt,
  error: unknown,
): Promise<SummaryBucket> {
  const { order, claimedAt } = attempt;
  const httpStatus = httpStatusOf(error);

  if (httpStatus !== null && PERMANENT_HTTP_STATUSES.has(httpStatus)) {
    await record(deps, attempt, "PERMANENT_ERROR", {
      lastErrorStatus: httpStatus,
      exhaustedAt: claimedAt,
    });
    emit("error", "retry-exhausted", {
      order: order.orderNumber,
      vendor: attempt.vendorId,
      session: order.providerReference,
      outcome: "PERMANENT_ERROR",
      httpStatus,
    });
    return "exhausted";
  }

  const failures = order.consecutiveFailures + 1;

  if (failures >= config.maxRetryableFailures) {
    await record(deps, attempt, "RETRYABLE_ERROR", {
      consecutiveFailures: failures,
      lastErrorStatus: httpStatus,
      exhaustedAt: claimedAt,
    });
    emit("error", "retry-exhausted", {
      order: order.orderNumber,
      vendor: attempt.vendorId,
      session: order.providerReference,
      outcome: "RETRYABLE_ERROR",
      httpStatus,
      attempt: failures,
    });
    return "exhausted";
  }

  const nextAttemptAt = new Date(claimedAt.getTime() + config.retryBaseMs * 2 ** (failures - 1));
  await record(deps, attempt, "RETRYABLE_ERROR", {
    consecutiveFailures: failures,
    nextAttemptAt,
    lastErrorStatus: httpStatus,
  });
  emit("error", "retry-scheduled", {
    order: order.orderNumber,
    vendor: attempt.vendorId,
    session: order.providerReference,
    outcome: "RETRYABLE_ERROR",
    httpStatus,
    attempt: failures,
    nextAttemptAt: nextAttemptAt.toISOString(),
  });
  return "unresolved";
}

async function defer(
  deps: SweepDeps,
  attempt: Attempt,
  nextAttemptAt: Date,
): Promise<SummaryBucket> {
  await record(deps, attempt, "DEFERRED", { nextAttemptAt });
  emit("log", "retry-scheduled", {
    order: attempt.order.orderNumber,
    outcome: "DEFERRED",
    nextAttemptAt: nextAttemptAt.toISOString(),
  });
  return "deferred";
}

async function reconcile(
  deps: SweepDeps,
  config: SweepConfig,
  attempt: Attempt,
): Promise<SummaryBucket> {
  const { order, vendorId, claimedAt } = attempt;
  const now = claimedAt.getTime();
  const isOld = order.createdAt.getTime() < now - config.longCutoffMs;

  // No stored session: nothing to ask the provider, and no binding is
  // constructible. Only the long cutoff can resolve it, and only through the
  // no-binding path — so there is no point looking again before then.
  if (order.providerReference === null) {
    if (!isOld) {
      return defer(deps, attempt, new Date(order.createdAt.getTime() + config.longCutoffMs));
    }
    const cancelled = await deps.orders.cancelUnpaid(
      vendorId,
      order.orderNumber,
      RELEASE_NOTES.noSession,
    );
    if (!cancelled) {
      await record(deps, attempt, "ALREADY_HANDLED");
      emit("log", "skipped", { order: order.orderNumber, reason: "already-processed" });
      return "skipped";
    }
    await record(deps, attempt, "RELEASED");
    emit("log", "transition", { order: order.orderNumber, outcome: "RELEASED" });
    return "released";
  }

  let session: RetrievedSession;
  try {
    session = await deps.payments.retrieveSession(order.providerReference);
  } catch (error) {
    return handleProviderFailure(deps, config, attempt, error);
  }

  emit("log", "provider-state", {
    order: order.orderNumber,
    session: session.id,
    status: session.status,
    paymentStatus: session.paymentStatus,
  });

  const binding: PaymentBinding = {
    provider: deps.provider,
    providerReference: session.id,
    amountPence: session.amountTotal,
    currency: session.currency,
  };

  if (session.paymentStatus === "paid") {
    const result = await deps.orders.confirm(order.orderNumber, binding);
    if (!result.ok) return handleRefusal(deps, attempt, result.reason, "confirm", session.id);
    // Recorded before the email so the #620 attribution survives a failure in
    // the email step. The email itself is sent only because THIS call performed
    // the transition, so a concurrent webhook and this sweep cannot both send it.
    await record(deps, attempt, "CONFIRMED");
    emit("log", "transition", { order: order.orderNumber, outcome: "CONFIRMED" });
    await deps.sendConfirmation(order.orderNumber);
    return "confirmed";
  }

  // Not paid. Only a session the provider has finished with may be released.
  const releasable = session.status === "expired" || (session.status === "complete" && isOld);

  if (!releasable) {
    return defer(deps, attempt, new Date(now + config.deferIntervalMs));
  }

  const note = session.status === "expired" ? RELEASE_NOTES.expired : RELEASE_NOTES.unsettled;
  const result = await deps.orders.fail(order.orderNumber, binding, note);
  if (!result.ok) return handleRefusal(deps, attempt, result.reason, "fail", session.id);
  await record(deps, attempt, "RELEASED");
  emit("log", "transition", { order: order.orderNumber, outcome: "RELEASED" });
  return "released";
}

/**
 * Takes up to `batchCap` candidates round-robin across vendors (#619), so one
 * vendor with a deep backlog cannot starve another: two vendors with 60 due
 * orders each get 25 apiece, and a vendor with 3 beside one with 100 gets all 3.
 */
async function selectCandidates(
  deps: SweepDeps,
  config: SweepConfig,
  candidateCutoff: Date,
  now: Date,
): Promise<{ vendorId: string; order: StalePendingOrder }[]> {
  const queues: { vendorId: string; orders: StalePendingOrder[] }[] = [];
  for (const vendorId of await deps.listVendorIds()) {
    queues.push({
      vendorId,
      orders: await deps.listCandidates(vendorId, candidateCutoff, now, config.batchCap),
    });
  }

  const picked: { vendorId: string; order: StalePendingOrder }[] = [];
  let progressed = true;
  while (picked.length < config.batchCap && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (picked.length >= config.batchCap) break;
      const order = queue.orders.shift();
      if (order) {
        picked.push({ vendorId: queue.vendorId, order });
        progressed = true;
      }
    }
  }
  return picked;
}

export async function runPaymentSweep(
  deps: SweepDeps,
  config: SweepConfig = DEFAULT_SWEEP_CONFIG,
): Promise<SweepSummary> {
  const now = deps.now();
  const candidateCutoff = new Date(now.getTime() - config.candidateCutoffMs);

  const summary: SweepSummary = {
    scanned: 0,
    confirmed: 0,
    released: 0,
    deferred: 0,
    unresolved: 0,
    exhausted: 0,
    skipped: 0,
  };

  emit("log", "run-started", {
    candidateCutoff: candidateCutoff.toISOString(),
    batchCap: config.batchCap,
  });

  for (const { vendorId, order } of await selectCandidates(deps, config, candidateCutoff, now)) {
    summary.scanned += 1;

    // Claimed at the run's own instant: the same value is the fence the outcome
    // is later written against.
    const claimedAt = now;
    const claimed = await deps.reconciliation.claim(
      vendorId,
      order.orderId,
      claimedAt,
      new Date(claimedAt.getTime() + config.leaseMs),
    );
    if (!claimed) {
      emit("log", "skipped", { order: order.orderNumber, reason: "claimed-elsewhere" });
      summary.skipped += 1;
      continue;
    }

    emit("log", "selected", {
      order: order.orderNumber,
      vendor: vendorId,
      session: order.providerReference,
      priorFailures: order.consecutiveFailures,
    });

    summary[await reconcile(deps, config, { vendorId, order, claimedAt })] += 1;
  }

  return summary;
}
