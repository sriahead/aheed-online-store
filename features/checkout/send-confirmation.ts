import { getEmailService } from "@/lib/email";
import { fetchVendorProfile } from "@/lib/repositories/vendor";
import { formatPrice } from "@/components/product/format-price";
import { splitDiscount } from "@/lib/order-totals";
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

    const { codePence, loyaltyPence } = splitDiscount(order);

    await getEmailService().send({
      to: order.buyerEmail,
      subject: `${vendor.senderName} — order ${order.orderNumber} confirmed`,
      html: `
        <p>Thanks — we've received your payment and your order is confirmed.</p>
        <p><strong>Order ${order.orderNumber}</strong></p>
        <table cellpadding="4">
          ${lines}
          <tr><td>Subtotal</td><td align="right">${formatPrice(order.subtotalPence)}</td></tr>
          ${
            // P5a (#135) rendered ONE generic Discount row here, because
            // discountPence can be a loyalty redemption, a discount code, or both
            // combined into one line, so no single label was true of every order.
            // P7.5b (#150) splits it into the parts it is made of, using the SAME
            // splitDiscount the order pages use rather than a second arithmetic
            // that could disagree with them. The rows still sum to discountPence,
            // so the money block reconciles exactly as before.
            codePence > 0 && order.discountCode
              ? `<tr><td>Code ${order.discountCode.code}</td><td align="right">−${formatPrice(
                  codePence,
                )}</td></tr>`
              : ""
          }
          ${
            loyaltyPence > 0
              ? `<tr><td>Loyalty points</td><td align="right">−${formatPrice(
                  loyaltyPence,
                )}</td></tr>`
              : ""
          }
          <tr><td>Delivery</td><td align="right">${
            order.deliveryFeePence === 0 ? "FREE" : formatPrice(order.deliveryFeePence)
          }</td></tr>
          <tr><td><strong>Total</strong></td><td align="right"><strong>${formatPrice(
            order.totalPence,
          )}</strong></td></tr>
        </table>
        ${
          // P7.5b (#138). Only ever a settled figure: this email is sent from the
          // webhook route AFTER confirmPayment committed, and its order is a
          // second, post-commit read, so a non-null pointsEarned is an award that
          // has actually happened. A guest order carries null and gets no line.
          order.pointsEarned !== null && order.pointsEarned > 0
            ? `<p>You earned <strong>${order.pointsEarned}</strong> loyalty points on this order.</p>`
            : ""
        }
        <p>We'll be in touch when it's on its way.</p>
      `,
    });
  } catch (error) {
    // Deliberately swallowed: the money is already confirmed.
    console.error(`order confirmation email failed for ${order.orderNumber}:`, error);
  }
}
