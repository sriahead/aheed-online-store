import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { getPaymentService, STRIPE_PAYMENT_PROVIDER } from "@/lib/payments";
import { getWebhookOrderService } from "@/lib/orders-service";
import { findOrderPaymentState } from "@/lib/repositories/orders";
import { sendOrderConfirmationEmail } from "@/features/checkout/send-confirmation";
import { checkOrderPayment, type PaymentCheckOutcome } from "@/lib/payment-check";
import { isPaidStatus } from "@/lib/order-status";

/** Everything `checkOrderPayment` can answer, plus "no such order for this vendor". */
export type PaymentCheckResult = PaymentCheckOutcome | { kind: "not-found" };

/**
 * The request-scoped facade for the single-order payment check (#1324): the
 * only place `lib/payment-check.ts`'s pure decision meets live clients, the
 * same division of labour as `lib/payment-sweep-service.ts`.
 *
 * Vendor-scoped: the order and its stored session are loaded for the CURRENT
 * vendor, so an order number from another store resolves to `not-found`. Callers
 * still do their own authorization first — the shopper action proves the
 * capability token, the staff action `requireVendorRole("ADMIN")`.
 *
 * Confirms through `getWebhookOrderService().confirm`, deliberately the same
 * entry point as the webhook and the sweep: a binding the stored Payment row
 * refuses is persisted as a refusal and surfaces on `/staff/payments`, because a
 * mismatch found here is the same anomaly whoever happened to find it.
 *
 * Constructed fresh per call, never cached (CLAUDE.md).
 */
export function getPaymentCheckService() {
  return {
    check: async (orderNumber: string): Promise<PaymentCheckResult> => {
      const order = await findOrderPaymentState(
        getPrisma(),
        await getCurrentVendorId(),
        orderNumber,
      );
      if (!order) return { kind: "not-found" };

      const orders = getWebhookOrderService();
      return checkOrderPayment(
        {
          retrieveSession: (sessionId) => getPaymentService().retrieveSession(sessionId),
          confirm: (number, binding) => orders.confirm(number, binding),
          sendConfirmation: async (number) => {
            const confirmed = await orders.findOrder(number);
            if (confirmed) await sendOrderConfirmationEmail(confirmed);
          },
          provider: STRIPE_PAYMENT_PROVIDER,
        },
        order,
      );
    },

    /**
     * Staff "Resend confirmation email". Only for a paid order: an "order
     * confirmed" email for an unpaid or cancelled one would be a false statement
     * to the customer. `sent` means handed to the email service —
     * `sendOrderConfirmationEmail` never throws and swallows provider failures,
     * so nothing here can know it was delivered (#946 is that problem).
     */
    resendConfirmation: async (
      orderNumber: string,
    ): Promise<{ kind: "not-found" } | { kind: "not-paid" } | { kind: "sent" }> => {
      const state = await findOrderPaymentState(
        getPrisma(),
        await getCurrentVendorId(),
        orderNumber,
      );
      if (!state) return { kind: "not-found" };
      if (!isPaidStatus(state.status)) return { kind: "not-paid" };

      // Vendor ownership is proved by the scoped read above; this load is only
      // for the email's content.
      const order = await getWebhookOrderService().findOrder(orderNumber);
      if (!order) return { kind: "not-found" };
      await sendOrderConfirmationEmail(order);
      console.log(`confirmation email resent by staff order=${orderNumber}`);
      return { kind: "sent" };
    },
  };
}
