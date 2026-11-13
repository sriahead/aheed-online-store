import type { OrderEvent } from "@/lib/order-notifications/next-step";
import type { CopyField, CopyFields } from "./copy";

/**
 * #1564 R5/R6 — every customer email as a registered template: what it is called in the editor, why
 * the customer received it (the locked footer line), the placeholders its wording may use, which
 * fields a store admin may edit, and the platform's default wording.
 *
 * Copy principles (R7): the subject says what happened, without a store-name suffix (the From name
 * is the store); the first line states the purpose; one primary action; reassurance last. Honest
 * by design: no countdowns, no invented scarcity, no marketing in a transactional email, and no
 * text a stranger could have typed — the contact and sign-up forms accept any address.
 */

export const TEMPLATE_KEYS = [
  "order.confirmed",
  "order.out_for_delivery",
  "order.delivered",
  "order.ready_for_collection",
  "order.collected",
  "order.cancelled",
  "order.payment_failed",
  "auth.verify_email",
  "auth.reset_password",
  "auth.existing_account",
  "contact.acknowledgement",
  "contact.complaint_acknowledgement",
  "enquiry.reply",
  "marketing.abandoned_checkout",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type TemplateGroup = "Orders" | "Account" | "Contact" | "Marketing";

export interface TemplateDefinition {
  key: TemplateKey;
  group: TemplateGroup;
  label: string;
  /** When the email is sent, for the editor. */
  description: string;
  /** Locked footer line: why the customer received it. */
  reason: string;
  placeholders: readonly string[];
  editable: readonly CopyField[];
  defaults: CopyFields;
}

const ALL: readonly CopyField[] = [
  "subject",
  "preheader",
  "heading",
  "intro",
  "ctaLabel",
  "reassurance",
  "signOff",
];

const ORDER_PLACEHOLDERS = ["storeName", "orderNumber"] as const;
const ORDER_REASON = "You're receiving this email about an order you placed with {{storeName}}.";
const ORDER_REASSURANCE =
  "Questions about your order? Just reply to this email and our team will help.";
const SIGN_OFF = "Thank you for shopping with {{storeName}}.";

function order(
  key: TemplateKey,
  label: string,
  description: string,
  copy: Pick<CopyFields, "subject" | "preheader" | "heading" | "intro"> &
    Partial<Pick<CopyFields, "reassurance" | "signOff">>,
): TemplateDefinition {
  return {
    key,
    group: "Orders",
    label,
    description,
    reason: ORDER_REASON,
    placeholders: ORDER_PLACEHOLDERS,
    editable: ALL,
    defaults: {
      ctaLabel: "View your order",
      reassurance: ORDER_REASSURANCE,
      signOff: SIGN_OFF,
      ...copy,
    },
  };
}

const DEFINITIONS: readonly TemplateDefinition[] = [
  order("order.confirmed", "Order confirmed", "Sent when payment succeeds.", {
    subject: "Order {{orderNumber}} is confirmed",
    preheader: "Thank you for your order. Here's what happens next.",
    heading: "Thank you, your order is confirmed",
    intro: "We've received your payment and order **{{orderNumber}}** is confirmed.",
  }),
  order(
    "order.out_for_delivery",
    "Out for delivery",
    "Sent when staff mark a delivery order as out for delivery.",
    {
      subject: "Your order {{orderNumber}} is on its way",
      preheader: "Our driver has your order. Please keep your phone nearby.",
      heading: "Your order is on its way",
      intro: "Good news: order **{{orderNumber}}** has left us and is heading to you.",
    },
  ),
  order("order.delivered", "Delivered", "Sent when staff mark a delivery order as delivered.", {
    subject: "Order {{orderNumber}} has been delivered",
    preheader: "Your order has arrived. We hope you enjoy everything.",
    heading: "Your order has been delivered",
    intro: "Order **{{orderNumber}}** has been delivered. We hope you enjoy everything.",
    reassurance: "If anything isn't right, just reply to this email and we'll put it right.",
  }),
  order(
    "order.ready_for_collection",
    "Ready for collection",
    "Sent when staff mark a collection order as ready.",
    {
      subject: "Order {{orderNumber}} is ready to collect",
      preheader: "Your order is packed and waiting for you in store.",
      heading: "Your order is ready to collect",
      intro: "Order **{{orderNumber}}** is packed and waiting for you.",
    },
  ),
  order("order.collected", "Collected", "Sent when staff mark a collection order as collected.", {
    subject: "Thanks for collecting order {{orderNumber}}",
    preheader: "Your order has been collected. We hope to see you again soon.",
    heading: "Thanks for collecting your order",
    intro: "Order **{{orderNumber}}** has been collected. We hope to see you again soon.",
    reassurance: "If anything isn't right, just reply to this email and we'll put it right.",
  }),
  order("order.cancelled", "Order cancelled", "Sent when staff cancel an order.", {
    subject: "Order {{orderNumber}} has been cancelled",
    preheader: "We're sorry. Here's what this means for your payment.",
    heading: "Your order has been cancelled",
    intro: "We're sorry, we've had to cancel order **{{orderNumber}}**.",
    reassurance: "Please reply to this email and a member of our team will help.",
  }),
  order(
    "order.payment_failed",
    "Payment failed",
    "Sent when a delayed payment method (for example a bank payment) fails.",
    {
      subject: "Your payment for order {{orderNumber}} didn't go through",
      preheader: "No money has been taken. You can order again whenever you're ready.",
      heading: "Your payment didn't go through",
      intro:
        "Your payment for order **{{orderNumber}}** wasn't completed, so the order has been cancelled.",
      reassurance: "Questions? Just reply to this email and our team will help.",
    },
  ),
  {
    key: "auth.verify_email",
    group: "Account",
    label: "Confirm email address",
    description: "Sent when someone creates an account with email and password.",
    reason:
      "You're receiving this because this email address was used to create an account with {{storeName}}.",
    placeholders: ["storeName"],
    editable: ALL,
    defaults: {
      subject: "Confirm your email address",
      preheader: "One quick step to finish setting up your {{storeName}} account.",
      heading: "Confirm your email address",
      intro:
        "Thanks for creating an account with {{storeName}}. Please confirm this is your email address so you can sign in.",
      ctaLabel: "Confirm my email address",
      reassurance:
        "Didn't create an account? You can safely ignore this email. Nothing will be set up without your confirmation.",
      signOff: "The {{storeName}} team",
    },
  },
  {
    key: "auth.reset_password",
    group: "Account",
    label: "Reset password",
    description: "Sent when someone asks to reset their password.",
    reason:
      "You're receiving this because a password reset was requested for this email address at {{storeName}}.",
    placeholders: ["storeName"],
    editable: ALL,
    defaults: {
      subject: "Reset your {{storeName}} password",
      preheader: "Use the button inside to choose a new password.",
      heading: "Reset your password",
      intro: "We received a request to reset the password for your {{storeName}} account.",
      ctaLabel: "Choose a new password",
      reassurance:
        "Didn't ask for this? You can safely ignore this email. Your password won't change unless you use the button above.",
      signOff: "The {{storeName}} team",
    },
  },
  {
    key: "auth.existing_account",
    group: "Account",
    label: "Already have an account",
    description: "Sent when someone tries to register with an email that already has an account.",
    reason:
      "You're receiving this because this email address was used to sign up at {{storeName}}.",
    placeholders: ["storeName"],
    editable: ALL,
    defaults: {
      subject: "You already have an account with {{storeName}}",
      preheader: "No new account was created. Sign in to carry on.",
      heading: "Good news, you already have an account",
      intro:
        "It looks like you recently tried to create an account with this email address. We found your existing account, so no duplicate was created.",
      ctaLabel: "Sign in to your account",
      reassurance:
        "Didn't try to create an account? You can safely ignore this email. Your account hasn't changed and there's nothing you need to do.",
      signOff: "Thank you for choosing {{storeName}}.",
    },
  },
  {
    key: "contact.acknowledgement",
    group: "Contact",
    label: "Message received",
    description: "Sent when someone sends an enquiry through Contact us.",
    reason: "You're receiving this because this email address was used to contact {{storeName}}.",
    placeholders: ["storeName"],
    editable: ALL,
    defaults: {
      subject: "We've received your message",
      preheader: "Thanks for getting in touch. We'll reply as soon as we can.",
      heading: "Thanks for getting in touch",
      intro:
        "We've received your message and a member of our team will reply to this email address as soon as we can.",
      ctaLabel: "",
      reassurance: "Didn't contact {{storeName}}? You can safely ignore this email.",
      signOff: "The {{storeName}} team",
    },
  },
  {
    key: "contact.complaint_acknowledgement",
    group: "Contact",
    label: "Complaint received",
    description: "Sent when someone sends a complaint through Contact us.",
    reason: "You're receiving this because this email address was used to contact {{storeName}}.",
    placeholders: ["storeName"],
    editable: ALL,
    defaults: {
      subject: "We've received your complaint",
      preheader: "We're sorry something wasn't right. We'll be in touch soon.",
      heading: "We're sorry something wasn't right",
      intro:
        "We've received your complaint and a member of our team will reply to this email address as soon as we can. We read every complaint and will do our best to put things right.",
      ctaLabel: "",
      reassurance: "Didn't contact {{storeName}}? You can safely ignore this email.",
      signOff: "The {{storeName}} team",
    },
  },
  {
    key: "enquiry.reply",
    group: "Contact",
    label: "Staff reply",
    description:
      "Sent when staff reply from Enquiries & Inbox. The reply itself is what staff write; the subject stays “Re: …” so it threads.",
    reason: "You're receiving this because you contacted {{storeName}}.",
    placeholders: ["storeName"],
    editable: ["reassurance", "signOff"],
    defaults: {
      subject: "",
      preheader: "",
      heading: "A reply from {{storeName}}",
      intro: "",
      ctaLabel: "",
      reassurance: "You can reply to this email to continue the conversation.",
      signOff: "The {{storeName}} team",
    },
  },
  {
    key: "marketing.abandoned_checkout",
    group: "Marketing",
    label: "Basket reminder",
    description:
      "Sent only when an admin presses Send reminder on an abandoned checkout, to customers who agreed to marketing.",
    reason: "You're receiving this because you agreed to hear from {{storeName}}.",
    placeholders: ["storeName"],
    editable: ALL,
    defaults: {
      subject: "Your basket is waiting for you",
      preheader: "You were one step away from finishing your order.",
      heading: "Your basket is waiting",
      intro:
        "You were one step away from finishing your order with {{storeName}}, so we've kept a note of what you chose.",
      ctaLabel: "Return to your basket",
      reassurance:
        "We haven't held these items, so popular ones may sell out before you check out. If you've changed your mind, there's nothing you need to do.",
      signOff: "The {{storeName}} team",
    },
  },
];

const BY_KEY = new Map(DEFINITIONS.map((d) => [d.key, d]));

export function templateDefinition(key: TemplateKey): TemplateDefinition {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`unknown email template ${key}`);
  return def;
}

export function allTemplateDefinitions(): readonly TemplateDefinition[] {
  return DEFINITIONS;
}

export const ORDER_TEMPLATE: Record<OrderEvent, TemplateKey> = {
  CONFIRMED: "order.confirmed",
  OUT_FOR_DELIVERY: "order.out_for_delivery",
  DELIVERED: "order.delivered",
  READY_FOR_COLLECTION: "order.ready_for_collection",
  COLLECTED: "order.collected",
  CANCELLED: "order.cancelled",
  PAYMENT_FAILED: "order.payment_failed",
};
