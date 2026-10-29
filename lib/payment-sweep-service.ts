import { getPrisma, getPrismaWs } from "@/lib/db";
import { getPaymentService, STRIPE_PAYMENT_PROVIDER } from "@/lib/payments";
import { getWebhookOrderService } from "@/lib/orders-service";
import {
  cancelUnpaidOrder,
  findNextPaymentSweepDueAt,
  listStalePendingOrders,
} from "@/lib/repositories/orders";
import {
  claimPaymentReconciliation,
  recordPaymentReconciliationOutcome,
} from "@/lib/repositories/payment-reconciliations";
import { listActiveVendorIds } from "@/lib/repositories/vendor";
import { sendOrderConfirmationEmail } from "@/features/checkout/send-confirmation";
import {
  DEFAULT_CANDIDATE_CUTOFF_MS,
  runPaymentSweep,
  type SweepConfig,
  type SweepSummary,
} from "@/lib/payment-sweep";
import { setPaymentSweepDue } from "@/lib/job-signals";

/** A run's summary plus when the sweep next has work (#1324), as the route returns it. */
export type SweepRunResult = SweepSummary & { nextDueAt: string | null };

/**
 * The request-scoped facade for the stranded payment sweep (P9.2, #618).
 *
 * Exists because `app/` may not import `@/lib/db` — `eslint.config.mjs`'s
 * `no-restricted-imports` rule enforces ADR-004 slice 2, keeping the app layer
 * out of Prisma so vendor scoping cannot be bypassed by a route resolving its
 * own client. Same division of labour as `lib/orders-service.ts` and
 * `lib/data-rights-service.ts`: the repository functions stay pure and take
 * their client explicitly, this module resolves live ones, and the route above
 * it holds neither.
 *
 * It also keeps `lib/payment-sweep.ts` free of every runtime import, which is
 * what lets that module's decision table be unit-tested with no mocks at all.
 * This file is the only place the two halves are joined.
 *
 * Constructed fresh per call, never cached: a cached Prisma client pins the
 * first request's I/O objects and throws "Cannot perform I/O on behalf of a
 * different request" on Workers.
 */
export function getPaymentSweepService() {
  return {
    run: async (config?: SweepConfig): Promise<SweepRunResult> => {
      const prisma = getPrisma();
      // Always the WEBSOCKET client for writes: confirmPayment runs an
      // interactive transaction, and releaseOrder uses updateMany, which
      // crashes outright on the HTTP adapter (#382). The reconciliation claim
      // and record are createMany/updateMany too (#945).
      const prismaWs = getPrismaWs();
      const orders = getWebhookOrderService();

      const summary = await runPaymentSweep(
        {
          payments: getPaymentService(),
          orders: {
            confirm: (orderNumber, binding) => orders.confirm(orderNumber, binding),
            fail: (orderNumber, binding, reason) => orders.fail(orderNumber, binding, reason),
            cancelUnpaid: (vendorId, orderNumber, reason) =>
              cancelUnpaidOrder(prismaWs, vendorId, orderNumber, reason),
          },
          reconciliation: {
            claim: (vendorId, orderId, claimedAt, leaseUntil) =>
              claimPaymentReconciliation(prismaWs, vendorId, orderId, claimedAt, leaseUntil),
            record: (vendorId, orderId, claimedAt, record) =>
              recordPaymentReconciliationOutcome(prismaWs, vendorId, orderId, claimedAt, record),
          },
          listVendorIds: () => listActiveVendorIds(prisma),
          listCandidates: (vendorId, olderThan, now, limit) =>
            listStalePendingOrders(prisma, vendorId, olderThan, now, limit),
          sendConfirmation: async (orderNumber) => {
            const order = await orders.findOrder(orderNumber);
            if (order) await sendOrderConfirmationEmail(order);
          },
          provider: STRIPE_PAYMENT_PROVIDER,
          now: () => new Date(),
        },
        config,
      );

      // #1324 — the scheduler calls the sweep only when this says there is work.
      // Computed AFTER the run, from the database, so it reflects everything the
      // run just deferred, backed off or resolved; it is the value every earlier
      // marker race converges to. `null` deletes the key: nothing is pending.
      const cutoffMs = config?.candidateCutoffMs ?? DEFAULT_CANDIDATE_CUTOFF_MS;
      let nextDue: Date | null = null;
      for (const vendorId of await listActiveVendorIds(prisma)) {
        const due = await findNextPaymentSweepDueAt(prisma, vendorId, cutoffMs);
        if (due && (!nextDue || due < nextDue)) nextDue = due;
      }
      await setPaymentSweepDue(nextDue);

      return { ...summary, nextDueAt: nextDue ? nextDue.toISOString() : null };
    },
  };
}
