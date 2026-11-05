import type { AppEnvironment } from "@/lib/config";
import { resolveContactRecipient, type RecipientAddress } from "@/lib/contact/recipient";
import type { EmailSender } from "@/lib/email";
import type { NotificationMessage } from "@/lib/notifications/dispatch";
import type { WebhookOrder } from "@/lib/repositories/orders";
import { buildCustomerEmail } from "./customer-email";
import type { OrderEvent } from "./next-step";
import {
  buildOwnerDigestEmail,
  buildOwnerEmail,
  ownerDigestTelegramText,
  ownerTelegramText,
} from "./owner";

/**
 * #1435 R8/R15/R18 — every message one order event produces, as data. Pure: the request-scoped
 * half (`lib/order-notifications-service.ts`) loads the store, its hosts, its receiving addresses
 * and its Telegram recipients, then hands the result to `dispatchNotifications`.
 */

export interface StoreContext {
  vendorId: string;
  sender: EmailSender;
  baseUrl: string | null;
  /** R15: the ORDERS mailbox, else SUPPORT, else none — see `resolveOwnerEmail`. */
  ownerEmail: string | null;
  telegramChatIds: readonly string[];
  environment: AppEnvironment;
}

/**
 * R15 — the owner's mailbox: the first ORDERS receiving address's `forwardTo`, else the first
 * SUPPORT one. The contact form's resolver, asked about an order, walks exactly that order; the
 * platform default inbox is deliberately NOT a fallback here (passed as unset), because order
 * notifications for a store must never land in the platform's mailbox.
 */
export function resolveOwnerEmail(addresses: readonly RecipientAddress[]): string | null {
  return resolveContactRecipient({
    type: "COMPLAINT",
    hasOrder: true,
    addresses,
    defaultForward: { status: "unset" },
  });
}

export function customerMessage(
  order: WebhookOrder,
  event: OrderEvent,
  store: StoreContext,
): NotificationMessage | null {
  if (!order.buyerEmail) return null;
  const { subject, html } = buildCustomerEmail({
    order,
    event,
    storeName: store.sender.name,
    baseUrl: store.baseUrl,
  });
  return {
    channel: "EMAIL",
    destination: order.buyerEmail,
    subject,
    body: html,
    sender: store.sender,
    log: { audience: "CUSTOMER", event },
  };
}

export function ownerMessages(
  order: WebhookOrder,
  event: OrderEvent,
  store: StoreContext,
): NotificationMessage[] {
  const messages: NotificationMessage[] = [];
  if (store.ownerEmail) {
    const { subject, html } = buildOwnerEmail({
      order,
      event,
      storeName: store.sender.name,
      baseUrl: store.baseUrl,
    });
    messages.push({
      channel: "EMAIL",
      destination: store.ownerEmail,
      subject,
      body: html,
      sender: store.sender,
      replyTo: order.buyerEmail ?? undefined,
      log: { audience: "OWNER", event },
    });
  }
  if (store.telegramChatIds.length > 0) {
    const text = ownerTelegramText({
      order,
      event,
      storeName: store.sender.name,
      baseUrl: store.baseUrl,
      environment: store.environment,
    });
    for (const chatId of store.telegramChatIds) {
      messages.push({
        channel: "TELEGRAM",
        destination: chatId,
        body: text,
        log: { audience: "OWNER", event },
      });
    }
  }
  return messages;
}

/** R18 — one owner digest per recipient per channel for a bulk change to `event`. */
export function ownerDigestMessages(
  event: OrderEvent,
  orderNumbers: readonly string[],
  store: StoreContext,
): NotificationMessage[] {
  if (orderNumbers.length === 0) return [];
  const messages: NotificationMessage[] = [];
  if (store.ownerEmail) {
    const { subject, html } = buildOwnerDigestEmail(event, orderNumbers, store.baseUrl);
    messages.push({
      channel: "EMAIL",
      destination: store.ownerEmail,
      subject,
      body: html,
      sender: store.sender,
      log: { audience: "OWNER", event },
    });
  }
  const text = ownerDigestTelegramText(event, orderNumbers, store.environment);
  for (const chatId of store.telegramChatIds) {
    messages.push({
      channel: "TELEGRAM",
      destination: chatId,
      body: text,
      log: { audience: "OWNER", event },
    });
  }
  return messages;
}
