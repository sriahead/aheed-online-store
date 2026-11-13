import { formatPrice } from "@/components/product/format-price";
import type { AppEnvironment } from "@/lib/config";
import { withEnvironmentTag } from "@/lib/email/environment-tag";
import type { EmailBrand } from "@/lib/email/layout/brand";
import { fallbackBrand } from "@/lib/email/layout/fallback";
import { finish, type RenderedEmail } from "@/lib/email/templates/compose";
import type { WebhookOrder } from "@/lib/repositories/orders";
import { staffOrderHref } from "./links";
import type { OrderEvent } from "./next-step";
import { slotLabel } from "./slot";

/**
 * #1435 R16-R18 — what the store owner gets for an order event, by Telegram and by email.
 *
 * Built to be scanned in a second (what happened, which order, how much, when) with one link to act
 * on. The Telegram text carries NO customer name, email, address or product names: Telegram is a
 * third party and a staff group can have many members, so it gets only what is needed to know an
 * order needs attention. The owner email goes to the store's own mailbox and may carry the items.
 * #1564 R15: the owner emails use the shared layout (store header and footer), not editable.
 */

export const OWNER_TITLE: Record<OrderEvent, string> = {
  CONFIRMED: "New order",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  READY_FOR_COLLECTION: "Ready for collection",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
  PAYMENT_FAILED: "Payment failed",
};

/** At most this many order numbers in a bulk digest; the rest become `+<n> more`. */
export const DIGEST_MAX_ORDERS = 20;

export interface OwnerMessageInput {
  order: WebhookOrder;
  event: OrderEvent;
  storeName: string;
  baseUrl: string | null;
  environment: AppEnvironment;
}

function itemCount(order: WebhookOrder): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Lines 2-4 of R16: order, total with item count, method and slot. */
function factLines(order: WebhookOrder): string[] {
  const label = slotLabel(order.fulfilmentDate, order.fulfilmentSlot) ?? "no slot";
  const method = order.fulfilmentMethod === "COLLECTION" ? "Collection" : "Delivery";
  const count = itemCount(order);
  return [
    `Order: ${order.orderNumber}`,
    `Total: ${formatPrice(order.totalPence)} (${count} ${count === 1 ? "item" : "items"})`,
    `${method}: ${label}${order.isExpress ? " · Express" : ""}`,
  ];
}

export function ownerTelegramText(input: OwnerMessageInput): string {
  const { order, event, storeName, baseUrl, environment } = input;
  const lines = [
    withEnvironmentTag(`${OWNER_TITLE[event]}: ${storeName}`, environment),
    ...factLines(order),
  ];
  if (baseUrl) lines.push(staffOrderHref(baseUrl, order.orderNumber));
  return lines.join("\n");
}

/** #1564 R15 — the footer line on every staff email: who it is for, never a customer reason. */
export function staffReason(storeName: string): string {
  return `A notification for the ${storeName} team, sent to your store's orders address.`;
}

/** The subject is untagged: the email service adds [STAGING]/[DEV] when it sends. */
export function buildOwnerEmail(
  input: Omit<OwnerMessageInput, "environment"> & { brand?: EmailBrand },
): RenderedEmail {
  const { order, event, storeName, baseUrl } = input;
  const brand = input.brand ?? fallbackBrand(storeName, baseUrl);
  const facts = factLines(order).map((line) => {
    const i = line.indexOf(": ");
    return { label: line.slice(0, i), value: line.slice(i + 2) };
  });
  const subject = `${OWNER_TITLE[event]}: order ${order.orderNumber} — ${formatPrice(order.totalPence)}`;
  return finish(
    subject,
    {
      preheader: `${OWNER_TITLE[event]} · ${order.orderNumber} · ${formatPrice(order.totalPence)}`,
      heading: `${OWNER_TITLE[event]}: ${storeName}`,
      blocks: [
        { kind: "facts", rows: facts },
        {
          kind: "items",
          rows: order.items.map((item) => ({
            label: `${item.quantity} × ${item.productName}`,
            note: item.customNote,
            amount: formatPrice(item.lineTotalPence),
          })),
          totals: [{ label: "Total", amount: formatPrice(order.totalPence), strong: true }],
        },
      ],
      cta: baseUrl
        ? { label: "Open in staff panel", href: staffOrderHref(baseUrl, order.orderNumber) }
        : null,
      reason: staffReason(storeName),
    },
    brand,
  );
}

function digestLines(orderNumbers: readonly string[]): string[] {
  const shown = orderNumbers.slice(0, DIGEST_MAX_ORDERS);
  const rest = orderNumbers.length - shown.length;
  return rest > 0 ? [...shown, `+${rest} more`] : [...shown];
}

/** R18 — one message for a bulk status change: `<title>: <k> orders`, then the order numbers. */
export function digestTitle(event: OrderEvent, count: number): string {
  return `${OWNER_TITLE[event]}: ${count} ${count === 1 ? "order" : "orders"}`;
}

export function ownerDigestTelegramText(
  event: OrderEvent,
  orderNumbers: readonly string[],
  environment: AppEnvironment,
): string {
  return [
    withEnvironmentTag(digestTitle(event, orderNumbers.length), environment),
    ...digestLines(orderNumbers),
  ].join("\n");
}

export function buildOwnerDigestEmail(
  event: OrderEvent,
  orderNumbers: readonly string[],
  baseUrl: string | null,
  brand?: EmailBrand,
  storeName = brand?.storeName ?? "",
): RenderedEmail {
  const subject = digestTitle(event, orderNumbers.length);
  return finish(
    subject,
    {
      preheader: digestLines(orderNumbers).slice(0, 5).join(", "),
      heading: subject,
      blocks: [{ kind: "message", text: digestLines(orderNumbers).join("\n") }],
      cta: baseUrl ? { label: "Open in staff panel", href: `${baseUrl}/staff/orders` } : null,
      reason: staffReason(storeName || "store"),
    },
    brand ?? fallbackBrand(storeName, baseUrl),
  );
}
