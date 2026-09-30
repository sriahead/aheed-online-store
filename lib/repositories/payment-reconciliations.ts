import type { getPrisma } from "@/lib/db";
import type { PaymentReconciliationOutcome } from "@prisma/client/wasm";

/**
 * The payment sweep's memory of one order between scheduled runs (#945).
 *
 * #618's sweep decided each order correctly but remembered nothing, so an order
 * it could not resolve was asked about again on every tick, forever, at the
 * head of an oldest-first queue. This table is what lets it claim an order,
 * back off, give up, and say so.
 *
 * CLAIM, LEASE, FENCE. `claimPaymentReconciliation` pushes `nextAttemptAt`
 * forward by a lease before the provider is asked anything, so a Worker that
 * dies mid-attempt leaves a row that becomes due again on its own.
 * `recordPaymentReconciliationOutcome` writes only while `lastAttemptAt` still
 * equals the claim instant, so a slow run whose lease expired cannot overwrite
 * a newer claim's result.
 *
 * NONE OF THIS IS THE CORRECTNESS GUARANTEE. That is still `confirmPayment` /
 * `failPayment` / `releaseOrder` moving an order only out of `PENDING_PAYMENT`.
 * The claim buys efficiency and accurate bookkeeping — no duplicate provider
 * calls, one refusal row per refused order — not a second lock.
 *
 * EVERY WRITE HERE NEEDS `getPrismaWs()`. `createMany` and `updateMany` are the
 * two operations Prisma's client engine wraps in an implicit transaction, which
 * the HTTP adapter cannot run (#382). `tests/repository-transaction-safety.test.ts`
 * enforces it at the call sites.
 *
 * Every export takes its client and `vendorId` explicitly and reads no request
 * context (`tests/repository-purity.test.ts`).
 */

type Db = ReturnType<typeof getPrisma>;

export type ReconciliationOutcome = PaymentReconciliationOutcome;

/** What one completed attempt concluded, as the sweep hands it to be stored. */
export interface ReconciliationOutcomeRecord {
  outcome: ReconciliationOutcome;
  consecutiveFailures: number;
  nextAttemptAt: Date;
  lastErrorStatus: number | null;
  exhaustedAt: Date | null;
}

/** The two outcomes staff can re-arm: a provider that failed, not a binding that was refused. */
const REARMABLE: ReconciliationOutcome[] = ["RETRYABLE_ERROR", "PERMANENT_ERROR"];

/**
 * Takes this run's claim on one order. Returns `true` when this caller owns the
 * attempt, `false` when another run does (or the row is not due, or exhausted).
 *
 * `createMany … skipDuplicates` rather than a `create` that catches a unique
 * violation: the race becomes a row count instead of an error code, which
 * sidesteps the `P2002`-versus-`23505` divergence between the two adapters
 * entirely.
 */
export async function claimPaymentReconciliation(
  prisma: Db,
  vendorId: string,
  orderId: string,
  claimedAt: Date,
  leaseUntil: Date,
): Promise<boolean> {
  const inserted = await prisma.paymentReconciliation.createMany({
    data: [
      {
        orderId,
        vendorId,
        attemptCount: 1,
        lastAttemptAt: claimedAt,
        nextAttemptAt: leaseUntil,
      },
    ],
    skipDuplicates: true,
  });
  if (inserted.count === 1) return true;

  const { count } = await prisma.paymentReconciliation.updateMany({
    where: { orderId, vendorId, exhaustedAt: null, nextAttemptAt: { lte: claimedAt } },
    data: {
      lastAttemptAt: claimedAt,
      nextAttemptAt: leaseUntil,
      attemptCount: { increment: 1 },
    },
  });
  return count === 1;
}

/**
 * Stores what the claimed attempt concluded. Returns `false` — and writes
 * nothing — when the row has been re-claimed since `claimedAt`.
 */
export async function recordPaymentReconciliationOutcome(
  prisma: Db,
  vendorId: string,
  orderId: string,
  claimedAt: Date,
  record: ReconciliationOutcomeRecord,
): Promise<boolean> {
  const { count } = await prisma.paymentReconciliation.updateMany({
    where: { orderId, vendorId, lastAttemptAt: claimedAt },
    data: {
      lastOutcome: record.outcome,
      consecutiveFailures: record.consecutiveFailures,
      nextAttemptAt: record.nextAttemptAt,
      lastErrorStatus: record.lastErrorStatus,
      exhaustedAt: record.exhaustedAt,
    },
  });
  return count === 1;
}

export interface ExhaustedReconciliationRow {
  orderNumber: string;
  outcome: ReconciliationOutcome | null;
  lastErrorStatus: number | null;
  attemptCount: number;
  /** Never null for a listed row (the `where` requires it); typed as stored. */
  exhaustedAt: Date | null;
}

/**
 * This vendor's orders the sweep stopped retrying because the PROVIDER failed,
 * and which are still awaiting payment. `REFUSED` rows are deliberately absent:
 * each already has a `PaymentBindingRefusal` row on `/staff/payments` with
 * #454's recovery actions, and listing it twice would offer two remedies for
 * one problem.
 */
export async function listExhaustedPaymentReconciliations(
  prisma: Db,
  vendorId: string,
  take: number,
): Promise<ExhaustedReconciliationRow[]> {
  const rows = await prisma.paymentReconciliation.findMany({
    where: {
      vendorId,
      exhaustedAt: { not: null },
      lastOutcome: { in: REARMABLE },
      order: { status: "PENDING_PAYMENT" },
    },
    orderBy: { exhaustedAt: "desc" },
    take,
    select: {
      lastOutcome: true,
      lastErrorStatus: true,
      attemptCount: true,
      exhaustedAt: true,
      order: { select: { orderNumber: true } },
    },
  });

  return rows.map((row) => ({
    orderNumber: row.order.orderNumber,
    outcome: row.lastOutcome,
    lastErrorStatus: row.lastErrorStatus,
    attemptCount: row.attemptCount,
    exhaustedAt: row.exhaustedAt,
  }));
}

/**
 * Staff's Retry: makes an exhausted order due again with a clean failure count.
 * Scoped to the provider-failure outcomes and to an order still awaiting
 * payment, so a forged order number, a refused order, or one that has since
 * been resolved updates nothing.
 */
export async function rearmPaymentReconciliation(
  prisma: Db,
  vendorId: string,
  orderNumber: string,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.paymentReconciliation.updateMany({
    where: {
      vendorId,
      exhaustedAt: { not: null },
      lastOutcome: { in: REARMABLE },
      order: { orderNumber, status: "PENDING_PAYMENT" },
    },
    data: { exhaustedAt: null, consecutiveFailures: 0, nextAttemptAt: now },
  });
  return count === 1;
}

/**
 * The latest outcome the sweep recorded for one of this vendor's orders, or
 * null when the sweep never touched it. The staff order page reads it to say
 * whether the sweep, rather than the webhook, confirmed the payment (#620).
 */
export async function getPaymentReconciliationOutcome(
  prisma: Db,
  vendorId: string,
  orderNumber: string,
): Promise<ReconciliationOutcome | null> {
  const row = await prisma.paymentReconciliation.findFirst({
    where: { vendorId, order: { orderNumber } },
    select: { lastOutcome: true },
  });
  return row?.lastOutcome ?? null;
}
