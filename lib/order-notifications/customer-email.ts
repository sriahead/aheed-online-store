import { formatPrice } from "@/components/product/format-price";
import type { EmailBrand } from "@/lib/email/layout/brand";
import { fallbackBrand } from "@/lib/email/layout/fallback";
import type { EmailBlock } from "@/lib/email/layout/render";
import {
  finish,
  orNull,
  templateCopy,
  type CopyOverrides,
  type RenderedEmail,
} from "@/lib/email/templates/compose";
import { ORDER_TEMPLATE } from "@/lib/email/templates/registry";
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
 *   1. one heading saying what just happened, and the order number and slot as key facts;
 *   2. "what happens next", with the real slot when there is one (locked: the order tracker reads
 *      the same sentence, so an edited email can never contradict the page);
 *   3. the order itself (the confirmation keeps its full money block, plus a savings line only
 *      when a discount was actually recorded — never an invented "was" price);
 *   4. one button, "View your order", as the only order link;
 *   5. on the confirmation and the final email, the points actually earned.
 * #1564: rendered through the shared layout; the wording is the `order.*` template's.
 *
 * Transactional only: no cross-sell, no "reorder", no urgency. PECR forbids marketing in a
 * transactional email without consent, and tests/order-notification-guard.test.ts enforces it.
 * Every shopper- or vendor-supplied string is escaped by the layout (#1135).
 */

/** Events whose email names the points earned: the confirmation and the two final steps. */
const POINTS_EVENTS: readonly OrderEvent[] = ["CONFIRMED", "DELIVERED", "COLLECTED"];

export interface CustomerEmailInput {
  order: WebhookOrder;
  event: OrderEvent;
  /** The vendor's `senderName`. */
  storeName: string;
  /** `https://<canonical host>`, or null for no link. */
  baseUrl: string | null;
  /** #1564 — the store's look; a neutral one built from the name when absent. */
  brand?: EmailBrand;
  /** #1564 part 2 — the store's saved wording for this template. */
  overrides?: CopyOverrides | null;
}

function itemBlock(order: WebhookOrder, event: OrderEvent): EmailBlock {
  const rows = order.items.map((item) => ({
    label: `${item.quantity} × ${item.productName}`,
    note: item.customNote,
    amount: formatPrice(item.lineTotalPence),
  }));
  const total = { label: "Total", amount: formatPrice(order.totalPence), strong: true };
  if (event !== "CONFIRMED") return { kind: "items", rows, totals: [total] };

  // P7.5b (#150): the discount split into its parts with the SAME splitDiscount the order pages
  // use, so the rows still sum to discountPence and the block reconciles exactly.
  const { codePence, loyaltyPence } = splitDiscount(order);
  const totals: { label: string; amount: string; strong?: boolean }[] = [
    { label: "Subtotal", amount: formatPrice(order.subtotalPence) },
  ];
  if (codePence > 0 && order.discountCode) {
    totals.push({ label: `Code ${order.discountCode.code}`, amount: `−${formatPrice(codePence)}` });
  }
  if (loyaltyPence > 0) {
    totals.push({ label: "Loyalty points", amount: `−${formatPrice(loyaltyPence)}` });
  }
  totals.push({
    label: "Delivery",
    amount: order.deliveryFeePence === 0 ? "FREE" : formatPrice(order.deliveryFeePence),
  });
  totals.push(total);
  return { kind: "items", rows, totals };
}

export function buildCustomerEmail(input: CustomerEmailInput): RenderedEmail {
  const { order, event, storeName, baseUrl } = input;
  const brand = input.brand ?? fallbackBrand(storeName, baseUrl);
  const { copy, reason } = templateCopy(
    ORDER_TEMPLATE[event],
    { storeName, orderNumber: order.orderNumber },
    input.overrides,
  );
  const label = slotLabel(order.fulfilmentDate, order.fulfilmentSlot);
  const next = nextStepText(event, order.fulfilmentMethod, order.orderNumber);
  const slot = slotSentence(event, order.fulfilmentMethod, label);

  const facts = [{ label: "Order number", value: order.orderNumber }];
  if (label && event !== "CANCELLED" && event !== "PAYMENT_FAILED") {
    facts.push({
      label: order.fulfilmentMethod === "COLLECTION" ? "Collection slot" : "Delivery slot",
      value: label,
    });
  }

  const blocks: EmailBlock[] = [{ kind: "facts", rows: facts }];
  if (next) {
    blocks.push({
      kind: "callout",
      title: "What happens next",
      text: slot ? `${next} ${slot}` : next,
    });
  }
  blocks.push(itemBlock(order, event));
  if (event === "CONFIRMED" && order.discountPence > 0) {
    blocks.push({
      kind: "paragraph",
      text: `You saved **${formatPrice(order.discountPence)}** on this order.`,
    });
  }
  // Only ever a settled figure: the post-commit read carries an award that has happened, and a
  // guest order carries null and gets no line (P7.5b, #138).
  if (POINTS_EVENTS.includes(event) && order.pointsEarned !== null && order.pointsEarned > 0) {
    blocks.push({
      kind: "paragraph",
      text: `You earned **${order.pointsEarned}** loyalty points on this order.`,
    });
  }

  return finish(
    copy.subject,
    {
      preheader: copy.preheader,
      heading: copy.heading,
      intro: orNull(copy.intro),
      blocks,
      cta:
        baseUrl && copy.ctaLabel
          ? { label: copy.ctaLabel, href: customerOrderHref(baseUrl, order) }
          : null,
      reassurance: orNull(copy.reassurance),
      signOff: orNull(copy.signOff),
      reason,
    },
    brand,
  );
}
