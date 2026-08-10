import { getEmailService } from "@/lib/email";
import { fetchVendorProfile } from "@/lib/repositories/vendor";
import { formatPrice } from "@/components/product/format-price";
import type { WebhookOrder } from "@/lib/repositories/orders";

/**
 * Order confirmation email (P3c, #99).
 *
 * Sent ONLY after a successful PENDING_PAYMENT → CONFIRMED transition, never at
 * order creation: a payment that then failed would leave the shopper holding a
 * "confirmed" email for an order that was cancelled and its stock released.
 *
 * Never throws. A confirmed payment must not depend on an email provider being
 * reachable — lib/email.ts already logs-and-continues, and this adds the same
 * guarantee around the vendor lookup and rendering.
 */
export async function sendOrderConfirmationEmail(order: WebhookOrder): Promise<void> {
  try {
    if (!order.buyerEmail) {
      console.error(`order ${order.orderNumber} confirmed but has no buyer email`);
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
      subject: `${vendor.senderName} — order ${order.orderNumber} confirmed`,
      html: `
        <p>Thanks — we've received your payment and your order is confirmed.</p>
        <p><strong>Order ${order.orderNumber}</strong></p>
        <table cellpadding="4">
          ${lines}
          <tr><td>Subtotal</td><td align="right">${formatPrice(order.subtotalPence)}</td></tr>
          <tr><td>Delivery</td><td align="right">${
            order.deliveryFeePence === 0 ? "FREE" : formatPrice(order.deliveryFeePence)
          }</td></tr>
          <tr><td><strong>Total</strong></td><td align="right"><strong>${formatPrice(
            order.totalPence,
          )}</strong></td></tr>
        </table>
        <p>We'll be in touch when it's on its way.</p>
      `,
    });
  } catch (error) {
    // Deliberately swallowed: the money is already confirmed.
    console.error(`order confirmation email failed for ${order.orderNumber}:`, error);
  }
}
