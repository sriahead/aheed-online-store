import { getEnv } from "@/lib/config";
import { parseCheckoutEvent, verifyStripeSignature } from "@/lib/stripe-webhook";
import { getWebhookOrderService } from "@/lib/orders-service";
import { sendOrderConfirmationEmail } from "@/features/checkout/send-confirmation";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook (P3c, #99).
 *
 * Deliberately vendor-agnostic: Stripe calls one endpoint per environment with no
 * tenant context, so this must NOT resolve a vendor from the request host. The
 * order is found by `metadata.orderNumber` and its vendor read off the row.
 *
 * Status codes matter operationally: only a bad signature is a 4xx. Anything else
 * — an unknown event type, an order we can't find — returns 200, because a
 * non-2xx makes Stripe retry the same event for days against a situation that
 * will never resolve itself.
 */
export async function POST(req: Request) {
  const { STRIPE_WEBHOOK_SECRET } = getEnv();
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

      const confirmed = await orders.confirm(event.orderNumber);
      if (confirmed) {
        const order = await orders.findOrder(event.orderNumber);
        // Email only when THIS delivery performed the transition, so Stripe's
        // retries can't email the shopper twice.
        if (order) await sendOrderConfirmationEmail(order);
      }
      break;
    }

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      if (!event.orderNumber) break;
      await orders.fail(
        event.orderNumber,
        event.type === "checkout.session.expired"
          ? "Checkout session expired; stock released."
          : "Payment failed; stock released.",
      );
      break;
    }

    default:
      break; // unhandled event type — acknowledged so Stripe stops retrying
  }

  return new Response("ok", { status: 200 });
}
