import { getEnv, getPaymentEnv } from "@/lib/config";
import {
  parseCheckoutEvent,
  verifyStripeSignature,
  type StripeCheckoutEvent,
} from "@/lib/stripe-webhook";
import { getWebhookOrderService } from "@/lib/orders-service";
import { STRIPE_PAYMENT_PROVIDER } from "@/lib/payments";
import { sendOrderConfirmationEmail } from "@/features/checkout/send-confirmation";
import type { PaymentBinding, PaymentTransitionRefusal } from "@/lib/repositories/orders";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook (P3c, #99).
 *
 * Deliberately vendor-agnostic: Stripe calls one endpoint per environment with no
 * tenant context, so this must NOT resolve a vendor from the request host. The
 * order is found by `metadata.orderNumber` and its vendor read off the row.
 *
 * Status codes matter operationally: only a bad signature is a 4xx. Anything else
 * — an unknown event type, an order we can't find, an event that fails the
 * payment binding — returns 200, because a non-2xx makes Stripe retry the same
 * event for days against a situation that will never resolve itself.
 *
 * P9.1 (#429): a verified signature is no longer sufficient to move an order.
 * Every transition below also passes a `PaymentBinding`, and the repository
 * proves it against the stored `Payment` row inside the same statement that
 * performs the transition. This layer builds the claim and reports the outcome;
 * it does not evaluate it.
 */

/** What this event claims about the payment. Nulls are refused downstream. */
function bindingFor(event: StripeCheckoutEvent): PaymentBinding {
  return {
    provider: STRIPE_PAYMENT_PROVIDER,
    providerReference: event.sessionId,
    amountPence: event.amountTotal,
    currency: event.currency,
  };
}

/**
 * `already-processed` is normal and stays silent — Stripe retries aggressively,
 * and a duplicate delivery is the system working. The other three are anomalies
 * someone needs to see, so they are loud.
 *
 * Deliberately logs identifiers only: reason, event type, order number, session
 * id. No buyer name, email, address or payment-method detail goes near this line
 * — a webhook log is not a place customer data should accumulate.
 */
function reportRefusal(
  reason: PaymentTransitionRefusal,
  event: StripeCheckoutEvent,
  orderNumber: string,
): void {
  if (reason === "already-processed") return;
  console.error(
    `stripe webhook refused: reason=${reason} event=${event.type} order=${orderNumber} session=${event.sessionId ?? "none"}`,
  );
}
export async function POST(req: Request) {
  const { STRIPE_WEBHOOK_SECRET } = getPaymentEnv();
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("stripe webhook received but STRIPE_WEBHOOK_SECRET is unset");
    return new Response("Webhook not configured", { status: 500 });
  }

  // The RAW body — re-serialising parsed JSON changes bytes and the HMAC never matches.
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!(await verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Malformed payload", { status: 400 });
  }

  const event = parseCheckoutEvent(payload);
  if (!event) return new Response("ok", { status: 200 });

  const orders = getWebhookOrderService();

  // Beyond this point every outcome is a 200 — the signature proved it came from
  // Stripe, so retrying it would not help.
  switch (event.type) {
    case "checkout.session.completed": {
      // completed != paid: asynchronous methods complete the session first and
      // settle later, so confirming here would mark an unpaid order CONFIRMED.
      if (event.paymentStatus !== "paid") break;
      if (!event.orderNumber) break;

      const confirmed = await orders.confirm(event.orderNumber, bindingFor(event));
      // Keyed on `ok`, never on the result object's truthiness — an object is
      // always truthy, so a truthiness check here would email on every refusal.
      if (confirmed.ok) {
        const order = await orders.findOrder(event.orderNumber);
        // Email only when THIS delivery performed the transition, so Stripe's
        // retries can't email the shopper twice.
        if (order) await sendOrderConfirmationEmail(order);
      } else {
        reportRefusal(confirmed.reason, event, event.orderNumber);
      }
      break;
    }

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      if (!event.orderNumber) break;
      const failed = await orders.fail(
        event.orderNumber,
        bindingFor(event),
        event.type === "checkout.session.expired"
          ? "Checkout session expired; stock released."
          : "Payment failed; stock released.",
      );
      if (!failed.ok) reportRefusal(failed.reason, event, event.orderNumber);
      break;
    }

    default:
      break; // unhandled event type — acknowledged so Stripe stops retrying
  }

  return new Response("ok", { status: 200 });
}
