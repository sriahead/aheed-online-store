import type { OrderAlertChannel } from "@prisma/client/wasm";
import { getPrisma } from "@/lib/db";
import { getAppEnvironment, getTelegramBotToken } from "@/lib/config";
import { withEnvironmentTag } from "@/lib/email/environment-tag";
import {
  createOrderAlertRecipient,
  deleteOrderAlertRecipient,
  findOrderAlertRecipient,
  listOrderAlertRecipients,
  type CreateOrderAlertRecipientResult,
  type OrderAlertRecipientRow,
} from "@/lib/repositories/order-alert";
import { fetchVendorProfile } from "@/lib/repositories/vendor";
import type { OrderAlertBrief } from "@/lib/order-alert/brief";
import { buildOrderAlertRegistry, type AlertSendResult } from "@/lib/order-alert/channels";
import { sendOrderAlert, type OrderAlertSummary } from "@/lib/order-alert/send";

/**
 * #1390 — the request-scoped half of order alerts: resolves the live Prisma client, the bot token
 * and the environment, and hands them to the pure pieces in lib/order-alert/. Used by the inbound
 * alert route, the contact form and Client Setup.
 */

/** Sends one alert to every recipient of the vendor. Never throws (R7). */
export async function sendOrderAlertForVendor(
  vendorId: string,
  brief: OrderAlertBrief,
): Promise<OrderAlertSummary> {
  const prisma = getPrisma();
  return sendOrderAlert(
    {
      listRecipients: (id) => listOrderAlertRecipients(prisma, id),
      registry: buildOrderAlertRegistry(getTelegramBotToken()),
      environment: getAppEnvironment(),
      log: (message) => console.log(message),
    },
    vendorId,
    brief,
  );
}

export function isTelegramBotTokenSet(): boolean {
  return getTelegramBotToken().status === "set";
}

export async function listOrderAlertRecipientsForVendor(
  vendorId: string,
): Promise<OrderAlertRecipientRow[]> {
  return listOrderAlertRecipients(getPrisma(), vendorId);
}

export async function addOrderAlertRecipient(
  vendorId: string,
  input: { channel: OrderAlertChannel; destination: string },
): Promise<CreateOrderAlertRecipientResult> {
  return createOrderAlertRecipient(getPrisma(), vendorId, input);
}

export async function removeOrderAlertRecipient(vendorId: string, id: string): Promise<boolean> {
  return (await deleteOrderAlertRecipient(getPrisma(), vendorId, id)) > 0;
}

/**
 * R14 — a test message to ONE of this vendor's recipients through its channel. `null` when the id
 * is not one of theirs (R15).
 */
export async function sendTestOrderAlert(
  vendorId: string,
  id: string,
): Promise<AlertSendResult | null> {
  const prisma = getPrisma();
  const recipient = await findOrderAlertRecipient(prisma, vendorId, id);
  if (!recipient) return null;
  const profile = await fetchVendorProfile(prisma, vendorId);
  const text = withEnvironmentTag(
    `Test alert from Client Setup: ${profile.name}`,
    getAppEnvironment(),
  );
  const registry = buildOrderAlertRegistry(getTelegramBotToken());
  return registry[recipient.channel].send(recipient.destination, text);
}
