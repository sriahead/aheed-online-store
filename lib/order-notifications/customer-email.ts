import { formatPrice } from "@/components/product/format-price";
import { escapeHtml } from "@/lib/html-escape";
import { splitDiscount } from "@/lib/order-totals";
import type { WebhookOrder } from "@/lib/repositories/orders";
import { customerOrderHref } from "./links";
import { nextStepText, slotSentence, type OrderEvent } from "./next-step";
import { slotLabel } from "./slot";

/**
 * #1435 R11-R14 — the customer's email for one order event. It replaces
 * `features/checkout/send-confirmation.ts` and `features/orders/send-status-email.ts`.
 *
 * The layout is deliberate (cognitive load, uncertainty reduction, peak-end):
 *   1. one heading sentence saying what just happened;
 *   2. "what happens next", with the real slot when there is one;
 *   3. the order itself (the confirmation keeps its full money block, plus a savings line only
 *      when a discount was actually recorded — never an invented "was" price);
 *   4. one button, "View your order", and no other link;
 *   5. on the confirmation and the final email, the points actually earned.
 *
 * Transactional only: no cross-sell, no "reorder", no urgency. PECR forbids marketing in a
 * transactional email without consent, and tests/order-notification-guard.test.ts enforces it.
 * Every shopper- or vendor-supplied string goes through `escapeHtml` (#1135).
 */

const SUBJECT_PHRASE: Record<OrderEvent, string> = {
  CONFIRMED: "is confirmed",
  OUT_FOR_DELIVERY: "is on its way",
  DELIVERED: "has been delivered",
  READY_FOR_COLLECTION: "is ready to collect",
  COLLECTED: "has been collected",
  CANCELLED: "has been cancelled",
  PAYMENT_FAILED: "was cancelled: payment didn't go through",
};

const HEADING: Record<OrderEvent, string> = {
  CONFIRMED: "Thanks — we've received your payment and your order is confirmed.",
  OUT_FOR_DELIVERY: "Your order is on its way.",
  DELIVERED: "Your order has been delivered. Thank you for shopping with us.",
  READY_FOR_COLLECTION: "Your order is ready to collect.",
  COLLECTED: "Your order has been collected. Thank you for shopping with us.",
  CANCELLED: "Your order has been cancelled.",
  PAYMENT_FAILED: "Your payment didn't go through, so this order has been cancelled.",
};

/** Events whose email names the points earned: the confirmation and the two final steps. */
const POINTS_EVENTS: readonly OrderEvent[] = ["CONFIRMED", "DELIVERED", "COLLECTED"];

const BUTTON_STYLE =
  "display:inline-block;padding:12px 20px;border-radius:12px;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold";

export interface CustomerEmailInput {
  order: WebhookOrder;
  event: OrderEvent;
  /** The vendor's `senderName`, used in the subject. */
  storeName: string;
  /** `https://<canonical host>`, or null for no link. */
  baseUrl: string | null;
}

export function customerEmailSubject(event: OrderEvent, orderNumber: string, storeName: string) {
  return `Order ${orderNumber} ${SUBJECT_PHRASE[event]} — ${storeName}`;
}

function itemRows(order: WebhookOrder): string {
  return order.items
    .map(
      (item) =>
        `<tr><td>${item.quantity} × ${escapeHtml(item.productName)}${
          item.customNote ? `<br><small>Note: ${escapeHtml(item.customNote)}</small>` : ""
        }</td><td align="right">${formatPrice(item.lineTotalPence)}</td></tr>`,
    )
    .join("");
}

function moneyRows(order: WebhookOrder, event: OrderEvent): string {
  const total = `<tr><td><strong>Total</strong></td><td align="right"><strong>${formatPrice(
    order.totalPence,
  )}</strong></td></tr>`;
  if (event !== "CONFIRMED") return total;

  // P7.5b (#150): the discount split into its parts with the SAME splitDiscount the order pages
  // use, so the rows still sum to discountPence and the block reconciles exactly.
  const { codePence, loyaltyPence } = splitDiscount(order);
  return [
    `<tr><td>Subtotal</td><td align="right">${formatPrice(order.subtotalPence)}</td></tr>`,
    codePence > 0 && order.discountCode
      ? `<tr><td>Code ${escapeHtml(order.discountCode.code)}</td><td align="right">−${formatPrice(codePence)}</td></tr>`
      : "",
    loyaltyPence > 0
      ? `<tr><td>Loyalty points</td><td align="right">−${formatPrice(loyaltyPence)}</td></tr>`
      : "",
    `<tr><td>Delivery</td><td align="right">${
      order.deliveryFeePence === 0 ? "FREE" : formatPrice(order.deliveryFeePence)
    }</td></tr>`,
    total,
  ].join("");
}

export function buildCustomerEmail(input: CustomerEmailInput): { subject: string; html: string } {
  const { order, event, storeName, baseUrl } = input;
  const label = slotLabel(order.fulfilmentDate, order.fulfilmentSlot);
  const next = nextStepText(event, order.fulfilmentMethod, order.orderNumber);
  const slot = slotSentence(event, order.fulfilmentMethod, label);

  const paragraphs: string[] = [];
  paragraphs.push(`<p><strong>${escapeHtml(HEADING[event])}</strong></p>`);
  if (next) {
    paragraphs.push(
      `<p><strong>What happens next:</strong> ${escapeHtml(next)}${slot ? ` ${escapeHtml(slot)}` : ""}</p>`,
    );
  }
  paragraphs.push(`<p><strong>Order ${escapeHtml(order.orderNumber)}</strong></p>`);
  paragraphs.push(`<table cellpadding="4">${itemRows(order)}${moneyRows(order, event)}</table>`);

  if (event === "CONFIRMED" && order.discountPence > 0) {
    paragraphs.push(`<p>You saved ${formatPrice(order.discountPence)} on this order.</p>`);
  }
  // Only ever a settled figure: the post-commit read carries an award that has happened, and a
  // guest order carries null and gets no line (P7.5b, #138).
  if (POINTS_EVENTS.includes(event) && order.pointsEarned !== null && order.pointsEarned > 0) {
    paragraphs.push(
      `<p>You earned <strong>${order.pointsEarned}</strong> loyalty points on this order.</p>`,
    );
  }
  if (baseUrl) {
    const href = escapeHtml(customerOrderHref(baseUrl, order));
    paragraphs.push(`<p><a href="${href}" style="${BUTTON_STYLE}">View your order</a></p>`);
  }

  return {
    subject: customerEmailSubject(event, order.orderNumber, storeName),
    html: paragraphs.join("\n"),
  };
}
