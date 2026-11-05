import type { WebhookOrder } from "@/lib/repositories/orders";

/** #1435 — a paid order as the notification path sees it. Override per test. */
export function webhookOrder(overrides: Partial<WebhookOrder> = {}): WebhookOrder {
  return {
    id: "o-1",
    vendorId: "v-1",
    orderNumber: "SHO-20261105-ABC123",
    status: "CONFIRMED",
    totalPence: 4250,
    subtotalPence: 4000,
    discountPence: 0,
    deliveryFeePence: 250,
    buyerEmail: "buyer@customer.test",
    userId: "u-1",
    isExpress: false,
    discountCode: null,
    pointsEarned: null,
    items: [
      {
        productName: "Item A",
        unitPricePence: 1000,
        quantity: 3,
        lineTotalPence: 3000,
        customNote: null,
      },
      {
        productName: "Item B",
        unitPricePence: 1000,
        quantity: 1,
        lineTotalPence: 1000,
        customNote: null,
      },
    ],
    fulfilmentMethod: "DELIVERY",
    fulfilmentDate: new Date("2026-11-06T00:00:00.000Z"),
    fulfilmentSlot: { startTime: "10:00", endTime: "12:00" },
    confirmationToken: "tok-guest-1",
    ...overrides,
  };
}

/** Strip tags and decode the entities `escapeHtml` produces, so copy can be asserted as text. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
