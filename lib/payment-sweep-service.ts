import { getPrisma, getPrismaWs } from "@/lib/db";
import { getPaymentService, STRIPE_PAYMENT_PROVIDER } from "@/lib/payments";
import { getWebhookOrderService } from "@/lib/orders-service";
import { cancelUnpaidOrder, listStalePendingOrders } from "@/lib/repositories/orders";
import { listActiveVendorIds } from "@/lib/repositories/vendor";
import { sendOrderConfirmationEmail } from "@/features/checkout/send-confirmation";
import { runPaymentSweep, type SweepConfig, type SweepSummary } from "@/lib/payment-sweep";

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
    run: (config?: SweepConfig): Promise<SweepSummary> => {
      const prisma = getPrisma();
      // Always the WEBSOCKET client for writes: confirmPayment runs an
      // interactive transaction, and releaseOrder uses updateMany, which
      // crashes outright on the HTTP adapter (#382).
      const prismaWs = getPrismaWs();
      const orders = getWebhookOrderService();

      return runPaymentSweep(
        {
          payments: getPaymentService(),
          orders: {
            confirm: (orderNumber, binding) => orders.confirm(orderNumber, binding),
            fail: (orderNumber, binding, reason) => orders.fail(orderNumber, binding, reason),
            cancelUnpaid: (vendorId, orderNumber, reason) =>
              cancelUnpaidOrder(prismaWs, vendorId, orderNumber, reason),
          },
          listVendorIds: () => listActiveVendorIds(prisma),
          listCandidates: (vendorId, olderThan, limit) =>
            listStalePendingOrders(prisma, vendorId, olderThan, limit),
          sendConfirmation: async (orderNumber) => {
            const order = await orders.findOrder(orderNumber);
            if (order) await sendOrderConfirmationEmail(order);
          },
          provider: STRIPE_PAYMENT_PROVIDER,
          now: () => new Date(),
        },
        config,
      );
    },
  };
}
