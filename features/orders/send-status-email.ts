import { getEmailService } from "@/lib/email";
import { fetchVendorProfile } from "@/lib/vendor-service";
import { formatPrice } from "@/components/product/format-price";
import type { WebhookOrder } from "@/lib/repositories/orders";

/**
 * Delivery-progress emails (P4b, #125).
 *
 * Sent only on the two staff-driven transitions. CONFIRMED is deliberately
 * absent: P3c already emails on payment confirmation, and adding a branch here
 * would send a shopper two mails for one event.
 *
 * Never throws, for the same reason sendOrderConfirmationEmail doesn't — a
 * delivery that physically happened must not be undone because an email
 * provider was unreachable. lib/email.ts already logs-and-continues; this adds
 * the same guarantee around the vendor lookup and the rendering.
 *
 * Called AFTER advanceOrderStatus has committed, never inside its transaction:
 * an HTTP call inside a Prisma transaction holds a Postgres transaction open
 * against a 5s timeout (the defect P3c had to fix in createPayment).
 */
const COPY: Record<string, { subject: string; heading: string; body: string }> = {
  OUT_FOR_DELIVERY: {
    subject: "is on its way",
    heading: "Your order is on its way.",
    body: "Our driver has it now — we'll email you again once it's been delivered.",
  },
  DELIVERED: {
    subject: "has been delivered",
    heading: "Your order has been delivered.",
    body: "Thanks for shopping with us. If anything isn't right, just reply to this email.",
  },
};

export async function sendOrderStatusEmail(order: WebhookOrder, status: string): Promise<void> {
  try {
    const copy = COPY[status];
    if (!copy) return; // Not a status this slice emails about — CONFIRMED included.

    if (!order.buyerEmail) {
      console.error(`order ${order.orderNumber} reached ${status} but has no buyer email`);
      return;
    }

    // Sender identity is the vendor's, from the DB — never a hardcoded store name.
    const vendor = await fetchVendorProfile(order.vendorId);

    const lines = order.items
      .map(
        (item) =>
          `<tr><td>${item.quantity} × ${item.productName}</td><td align="right">${formatPrice(
            item.lineTotalPence,
          )}</td></tr>`,
      )
      .join("");

    await getEmailService().send({
      to: order.buyerEmail,
      subject: `${vendor.senderName} — order ${order.orderNumber} ${copy.subject}`,
      html: `
        <p>${copy.heading}</p>
        <p><strong>Order ${order.orderNumber}</strong></p>
        <table cellpadding="4">
          ${lines}
          <tr><td><strong>Total</strong></td><td align="right"><strong>${formatPrice(
            order.totalPence,
          )}</strong></td></tr>
        </table>
        <p>${copy.body}</p>
      `,
    });
  } catch (error) {
    // Deliberately swallowed: the status change is already committed.
    console.error(`order status email failed for ${order.orderNumber} (${status}):`, error);
  }
}
