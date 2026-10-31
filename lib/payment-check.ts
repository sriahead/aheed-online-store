import type { RetrievedSession } from "@/lib/payments";
import type {
  ConfirmPaymentResult,
  PaymentBinding,
  PaymentTransitionRefusal,
} from "@/lib/repositories/orders";
import type { OrderStatusValue } from "@/lib/order-status";

/**
 * Check ONE order's payment now (#1324) — the shopper's return page and staff
 * "Check payment now" both run this.
 *
 * It is the paid row of `lib/payment-sweep.ts`'s decision table and nothing
 * else. Asks the provider about the order's OWN stored session, and confirms
 * through the same `confirmPayment` compare-and-set as the webhook and the sweep
 * when, and only when, the provider says `paid`. It never releases, fails or
 * cancels anything: `deps` has no member that could, so a request a shopper can
 * trigger cannot write their order off. Releasing an unpaid order stays the
 * sweep's job, gated on the session's own state.
 *
 * Every import above is type-only and erased, the same property
 * `lib/payment-sweep.ts` keeps: the table below is unit-tested with plain
 * objects for deps, no database, no Stripe key and no `vi.mock`.
 */

export interface PaymentCheckDeps {
  retrieveSession(sessionId: string): Promise<RetrievedSession>;
  confirm(orderNumber: string, binding: PaymentBinding): Promise<ConfirmPaymentResult>;
  /** Called only after a confirm that THIS call performed, so a racing webhook cannot double-send. */
  sendConfirmation(orderNumber: string): Promise<void>;
  /** The provider name written into the binding (`STRIPE_PAYMENT_PROVIDER`). */
  provider: string;
}

export interface PaymentCheckOrder {
  orderNumber: string;
  status: OrderStatusValue;
  /** The order's stored session id — never one taken from a URL or form. */
  providerReference: string | null;
}

export type PaymentCheckOutcome =
  | { kind: "not-pending" }
  | { kind: "no-session" }
  | { kind: "provider-error" }
  | { kind: "not-paid"; sessionStatus: string | null; paymentStatus: string | null }
  | { kind: "confirmed" }
  | { kind: "refused"; reason: PaymentTransitionRefusal };

export async function checkOrderPayment(
  deps: PaymentCheckDeps,
  order: PaymentCheckOrder,
): Promise<PaymentCheckOutcome> {
  if (order.status !== "PENDING_PAYMENT") return { kind: "not-pending" };
  if (order.providerReference === null) return { kind: "no-session" };

  let session: RetrievedSession;
  try {
    session = await deps.retrieveSession(order.providerReference);
  } catch {
    // "We asked and could not find out" is not "we asked and it was unpaid" —
    // and here neither one changes anything, so there is nothing to classify.
    return { kind: "provider-error" };
  }

  if (session.paymentStatus !== "paid") {
    return {
      kind: "not-paid",
      sessionStatus: session.status,
      paymentStatus: session.paymentStatus,
    };
  }

  // Built from the provider's own response, exactly as the sweep builds it;
  // `confirmPayment` still has to match the stored Payment row in its `where`.
  const result = await deps.confirm(order.orderNumber, {
    provider: deps.provider,
    providerReference: session.id,
    amountPence: session.amountTotal,
    currency: session.currency,
  });
  if (!result.ok) return { kind: "refused", reason: result.reason };

  await deps.sendConfirmation(order.orderNumber);
  return { kind: "confirmed" };
}
