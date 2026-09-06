import type { RetrievedSession } from "@/lib/payments";
import type {
  ConfirmPaymentResult,
  FailPaymentResult,
  PaymentBinding,
  StalePendingOrder,
} from "@/lib/repositories/orders";

/**
 * The stranded payment sweep (P9.2, #618) — the unattended half of #454.
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
 * runtime — the two imports above are type-only and erased — so its decision
 * table can be exercised by a unit test with no database, no Stripe key, no
 * Worker request context and no `vi.mock` call at all. That is the property that
 * makes the table below actually verifiable rather than merely reviewed;
 * `lib/config.ts` reads `getCloudflareContext()`, so anything that reaches it
 * transitively needs mocking to load, which is exactly what this avoids.
 *
 * THE DECISION TABLE. For each candidate the sweep asks the provider about the
 * order's OWN stored session and acts only on a definitive answer:
 *
 *   paid                  -> confirm, then email
 *   unpaid + expired      -> release (restock, reverse points, free the code)
 *   unpaid + open         -> nothing; the shopper can still pay
 *   unpaid + complete     -> nothing until the long cutoff, then release
 *   retrieveSession threw -> nothing, counted unresolved
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
 * until the end of time, which is this module's own reason for existing,
 * reintroduced one branch over. It cannot be released on sight either, because
 * `complete` plus `unpaid` is also what a still-settling payment looks like — so
 * it resolves on the long cutoff, the same backstop the no-stored-session case
 * uses.
 *
 * A PROVIDER OUTAGE MUST NOT LOOK LIKE AN ANSWER. `features/payments/reconcile-refusal.ts`
 * states the principle this inherits: "we asked and could not find out" is not
 * "we asked and it was unpaid" — the second authorizes writing the order off,
 * the first does not. A throw therefore transitions nothing and is retried by
 * the next scheduled run, which is why this module holds no retry logic of its
 * own.
 */

/** Why a release happened, written to the order's own status timeline (R30). */
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
  listVendorIds(): Promise<string[]>;
  listCandidates(vendorId: string, olderThan: Date, limit: number): Promise<StalePendingOrder[]>;
  /** Sent only after a confirm that actually performed the transition (R26). */
  sendConfirmation(orderNumber: string): Promise<void>;
  /**
   * The provider name written into the binding. Injected rather than imported so
   * this module keeps its zero-runtime-import property; the route supplies
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

export const DEFAULT_SWEEP_CONFIG: SweepConfig = {
  candidateCutoffMs: DEFAULT_CANDIDATE_CUTOFF_MS,
  longCutoffMs: DEFAULT_LONG_CUTOFF_MS,
  batchCap: DEFAULT_BATCH_CAP,
};

export interface SweepSummary {
  scanned: number;
  confirmed: number;
  released: number;
  deferred: number;
  unresolved: number;
}

/**
 * Mirrors the webhook route's `reportRefusal` rule exactly: `already-processed`
 * is normal — it means something else resolved the order between this run's
 * candidate query and its transition — and stays silent. Everything else is an
 * anomaly someone needs to see.
 *
 * Logs identifiers only. No buyer name, email or address goes near this line.
 */
function reportRefusal(orderNumber: string, reason: string, detail: string): void {
  if (reason === "already-processed") return;
  console.error(`payment sweep refused: reason=${reason} order=${orderNumber} detail=${detail}`);
}

export async function runPaymentSweep(
  deps: SweepDeps,
  config: SweepConfig = DEFAULT_SWEEP_CONFIG,
): Promise<SweepSummary> {
  const now = deps.now().getTime();
  const candidateCutoff = new Date(now - config.candidateCutoffMs);
  const longCutoff = new Date(now - config.longCutoffMs);

  const summary: SweepSummary = {
    scanned: 0,
    confirmed: 0,
    released: 0,
    deferred: 0,
    unresolved: 0,
  };

  let remaining = config.batchCap;

  for (const vendorId of await deps.listVendorIds()) {
    if (remaining <= 0) break;

    const candidates = await deps.listCandidates(vendorId, candidateCutoff, remaining);

    for (const order of candidates) {
      if (remaining <= 0) break;
      remaining -= 1;
      summary.scanned += 1;

      const isOld = order.createdAt.getTime() < longCutoff.getTime();

      // No stored session: nothing to ask the provider, and no binding is
      // constructible. Only the long cutoff can resolve it, and only through the
      // no-binding path.
      if (order.providerReference === null) {
        if (!isOld) {
          summary.deferred += 1;
          continue;
        }
        await deps.orders.cancelUnpaid(vendorId, order.orderNumber, RELEASE_NOTES.noSession);
        summary.released += 1;
        continue;
      }

      let session: RetrievedSession;
      try {
        session = await deps.payments.retrieveSession(order.providerReference);
      } catch (error) {
        summary.unresolved += 1;
        console.error(
          `payment sweep could not reach the payment provider: order=${order.orderNumber} session=${order.providerReference} error=${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      const binding: PaymentBinding = {
        provider: deps.provider,
        providerReference: session.id,
        amountPence: session.amountTotal,
        currency: session.currency,
      };

      if (session.paymentStatus === "paid") {
        const result = await deps.orders.confirm(order.orderNumber, binding);
        if (result.ok) {
          // Email only once the transition actually committed, so a concurrent
          // webhook delivery and this sweep cannot both email the shopper.
          await deps.sendConfirmation(order.orderNumber);
          summary.confirmed += 1;
        } else {
          summary.unresolved += 1;
          reportRefusal(order.orderNumber, result.reason, `confirm session=${session.id}`);
        }
        continue;
      }

      // Not paid. Only a session the provider has finished with may be released.
      const releasable = session.status === "expired" || (session.status === "complete" && isOld);

      if (!releasable) {
        summary.deferred += 1;
        continue;
      }

      const note = session.status === "expired" ? RELEASE_NOTES.expired : RELEASE_NOTES.unsettled;
      const result = await deps.orders.fail(order.orderNumber, binding, note);
      if (result.ok) {
        summary.released += 1;
      } else {
        summary.unresolved += 1;
        reportRefusal(order.orderNumber, result.reason, `fail session=${session.id}`);
      }
    }
  }

  return summary;
}
