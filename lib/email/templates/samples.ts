import { buildRecoveryEmail } from "@/lib/abandoned-checkout/email";
import { acknowledgementEmail } from "@/lib/contact/message";
import type { EmailBrand } from "@/lib/email/layout/brand";
import { existingAccountEmail } from "@/lib/notifications/existing-account";
import { buildCustomerEmail } from "@/lib/order-notifications/customer-email";
import type { OrderEvent } from "@/lib/order-notifications/next-step";
import type { WebhookOrder } from "@/lib/repositories/orders";
import { resetPasswordMessage, verifyEmailMessage } from "./account";
import type { CopyOverrides, RenderedEmail } from "./compose";
import { enquiryReplyEmail } from "./enquiry";
import { ORDER_TEMPLATE, type TemplateKey } from "./registry";

/**
 * #1564 R9/R11 — every template rendered with sample data: the editor's live preview, its "Send
 * test" email, and `npm run email:preview` all use this, so what an admin approves is what the
 * gallery showed. Sample links point at the store's own site and carry no real token.
 */

const SAMPLE_ORDER_NUMBER = "SAMPLE-1001";
const FALLBACK_ITEMS = ["First item", "Second item", "Third item"];

function sampleOrder(event: OrderEvent, products: readonly string[]): WebhookOrder {
  const names = products.length >= 3 ? products : FALLBACK_ITEMS;
  const collection = event === "READY_FOR_COLLECTION" || event === "COLLECTED";
  return {
    id: "sample",
    vendorId: "sample",
    orderNumber: SAMPLE_ORDER_NUMBER,
    status: event === "PAYMENT_FAILED" ? "CANCELLED" : event,
    totalPence: 3897,
    subtotalPence: 3897,
    discountPence: event === "CONFIRMED" ? 250 : 0,
    deliveryFeePence: collection ? 0 : 250,
    buyerEmail: "customer@example.com",
    userId: "sample",
    isExpress: false,
    discountCode: event === "CONFIRMED" ? { code: "WELCOME5", amountPence: 250 } : null,
    pointsEarned: event === "CONFIRMED" || event === "DELIVERED" ? 38 : null,
    items: [
      {
        productName: names[0],
        unitPricePence: 1299,
        quantity: 1,
        lineTotalPence: 1299,
        customNote: null,
      },
      {
        productName: names[1],
        unitPricePence: 899,
        quantity: 2,
        lineTotalPence: 1798,
        customNote: "Please pack separately",
      },
      {
        productName: names[2],
        unitPricePence: 800,
        quantity: 1,
        lineTotalPence: 800,
        customNote: null,
      },
    ],
    fulfilmentMethod: collection ? "COLLECTION" : "DELIVERY",
    fulfilmentDate: new Date(Date.UTC(2026, 10, 14)),
    fulfilmentSlot: { startTime: "10:00", endTime: "12:00" },
    confirmationToken: null,
  } as unknown as WebhookOrder;
}

const ORDER_EVENT_BY_KEY = Object.fromEntries(
  Object.entries(ORDER_TEMPLATE).map(([event, key]) => [key, event as OrderEvent]),
) as Partial<Record<TemplateKey, OrderEvent>>;

export function renderSample(
  key: TemplateKey,
  brand: EmailBrand,
  overrides?: CopyOverrides | null,
  products: readonly string[] = [],
): RenderedEmail {
  const store = brand.storeName;
  const base = brand.siteUrl ?? "https://shop.example";
  const event = ORDER_EVENT_BY_KEY[key];
  if (event) {
    return buildCustomerEmail({
      order: sampleOrder(event, products),
      event,
      storeName: store,
      baseUrl: base,
      brand,
      overrides,
    });
  }
  switch (key) {
    case "auth.verify_email":
      return verifyEmailMessage({ brand, url: `${base}/login`, overrides });
    case "auth.reset_password":
      return resetPasswordMessage({ brand, url: `${base}/forgot-password`, overrides });
    case "auth.existing_account":
      return existingAccountEmail({
        storeName: store,
        baseUrl: base,
        providers: ["credential", "google"],
        brand,
        overrides,
      });
    case "contact.acknowledgement":
      return acknowledgementEmail({
        storeName: store,
        type: "ENQUIRY",
        orderNumber: null,
        brand,
        overrides,
      });
    case "contact.complaint_acknowledgement":
      return acknowledgementEmail({
        storeName: store,
        type: "COMPLAINT",
        orderNumber: SAMPLE_ORDER_NUMBER,
        brand,
        overrides,
      });
    case "enquiry.reply":
      return enquiryReplyEmail({
        brand,
        storeName: store,
        originalSubject: "Question about my delivery",
        replyText:
          "Hi,\n\nThanks for your message. Your order is booked for Saturday between 10:00 and 12:00, and our driver will call when they're nearby.\n\nBest wishes",
        originalMessage: "Hello, can you tell me when my order will arrive?",
        orderNumber: SAMPLE_ORDER_NUMBER,
        overrides,
      });
    case "marketing.abandoned_checkout":
      return buildRecoveryEmail({
        storeName: store,
        firstName: "Sam",
        items: sampleOrder("CONFIRMED", products).items,
        totalPence: 3897,
        orderHref: `${base}/account/orders/${SAMPLE_ORDER_NUMBER}`,
        preferencesHref: `${base}/account/data`,
        code: {
          code: "THANKYOU10",
          kind: "PERCENTAGE",
          value: 1000,
          minSubtotalPence: 2000,
          endsAt: null,
        },
        brand,
        overrides,
      });
    default:
      throw new Error(`no sample for ${key}`);
  }
}
