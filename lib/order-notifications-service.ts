import { getPrisma } from "@/lib/db";
import { getAppEnvironment, getTelegramBotToken } from "@/lib/config";
import { getEmailService } from "@/lib/email";
import { clearNotificationOutboxPending, markNotificationOutboxPending } from "@/lib/job-signals";
import { telegramAdapter } from "@/lib/order-alert/channels";
import type { DispatchDeps } from "@/lib/notifications/dispatch";
import { runNotificationOutbox } from "@/lib/notifications/outbox";
import { resolveOwnerEmail, type StoreContext } from "@/lib/order-notifications/build";
import { canonicalBaseUrl } from "@/lib/order-notifications/links";
import { createOrderNotifier, type OrderNotifier } from "@/lib/order-notifications/notify";
import { listInboundAddresses } from "@/lib/repositories/inbound-address";
import {
  countNotificationOutbox,
  deleteNotificationOutboxRow,
  insertNotificationOutbox,
  listNotificationOutbox,
  recordNotificationOutboxFailure,
} from "@/lib/repositories/notification-outbox";
import { listOrderAlertRecipients } from "@/lib/repositories/order-alert";
import type { WebhookOrder } from "@/lib/repositories/orders";
import { fetchVendorProfile, listAllVendorIds, listVendorHosts } from "@/lib/repositories/vendor";

/**
 * #1435 — the request-scoped half of order notifications: resolves the live Prisma client, the email
 * service, the Telegram bot token and the environment, and hands them to the pure pieces in
 * `lib/order-notifications/` and `lib/notifications/`. Every order-event call site calls one of the
 * three functions below, after its order change has committed; none of them ever rejects.
 */

function dispatchDeps(prisma: ReturnType<typeof getPrisma>): DispatchDeps {
  return {
    email: getEmailService(),
    telegram: telegramAdapter(getTelegramBotToken()),
    enqueue: (vendorId, row) => insertNotificationOutbox(prisma, vendorId, row),
    markPending: markNotificationOutboxPending,
    log: (line) => console.log(line),
  };
}

async function loadStore(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<StoreContext> {
  // The profile (the sender) is required, as it always was for the customer email. The other three
  // only add a link or owner recipients, so a failed read degrades to "none" rather than costing
  // the customer their email.
  const [profile, hosts, addresses, recipients] = await Promise.all([
    fetchVendorProfile(prisma, vendorId),
    listVendorHosts(prisma, vendorId).catch(() => []),
    listInboundAddresses(prisma, vendorId).catch(() => []),
    listOrderAlertRecipients(prisma, vendorId).catch(() => []),
  ]);
  return {
    vendorId,
    sender: { name: profile.senderName, email: profile.senderEmail },
    baseUrl: canonicalBaseUrl(hosts),
    ownerEmail: resolveOwnerEmail(addresses),
    telegramChatIds: recipients.filter((r) => r.channel === "TELEGRAM").map((r) => r.destination),
    environment: getAppEnvironment(),
  };
}

function getOrderNotifier(): OrderNotifier {
  const prisma = getPrisma();
  return createOrderNotifier({
    loadStore: (vendorId) => loadStore(prisma, vendorId),
    dispatch: dispatchDeps(prisma),
    log: (line) => console.error(line),
  });
}

export async function notifyOrderEvent(order: WebhookOrder, status: string): Promise<void> {
  await getOrderNotifier().notifyOrderEvent(order, status);
}

export async function notifyCustomerConfirmation(order: WebhookOrder): Promise<void> {
  await getOrderNotifier().notifyCustomerConfirmation(order);
}

export async function notifyBulkStatusChange(
  moved: readonly { order: WebhookOrder; toStatus: string }[],
): Promise<void> {
  await getOrderNotifier().notifyBulkStatusChange(moved);
}

/** R5 — the retry job's run, bound to the live database, providers and KV marker. */
export function getNotificationOutboxService() {
  const prisma = getPrisma();
  return {
    run: () =>
      runNotificationOutbox({
        listVendorIds: () => listAllVendorIds(prisma),
        list: (vendorId, take) => listNotificationOutbox(prisma, vendorId, take),
        remove: (vendorId, id) => deleteNotificationOutboxRow(prisma, vendorId, id),
        recordFailure: (vendorId, id, attempts, lastError) =>
          recordNotificationOutboxFailure(prisma, vendorId, id, attempts, lastError),
        count: (vendorId) => countNotificationOutbox(prisma, vendorId),
        senderFor: async (vendorId) => {
          const profile = await fetchVendorProfile(prisma, vendorId);
          return { name: profile.senderName, email: profile.senderEmail };
        },
        email: getEmailService(),
        telegram: telegramAdapter(getTelegramBotToken()),
        mark: markNotificationOutboxPending,
        clear: clearNotificationOutboxPending,
        now: () => new Date(),
        log: (line) => console.error(line),
      }),
  };
}
