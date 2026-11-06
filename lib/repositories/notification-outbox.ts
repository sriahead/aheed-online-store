import type { getPrisma } from "@/lib/db";

/**
 * #1435 — the order-notification outbox (`NotificationOutbox`): a customer or owner message, email
 * or Telegram, whose first send failed.
 *
 * Every export takes its Prisma client and the store's `vendorId` explicitly
 * (tests/repository-client-injection.test.ts) and filters by it; the request-scoped side lives in
 * `lib/order-notifications-service.ts` and `lib/notifications/`. Only singular `create`/`update`,
 * `deleteMany` and `count` are used, all safe on the HTTP adapter — no `updateMany`/`createMany`
 * (#382), and the `create` carries no nested writes.
 */

type Db = ReturnType<typeof getPrisma>;

export type NotificationChannelValue = "EMAIL" | "TELEGRAM";

export interface NotificationOutboxInput {
  channel: NotificationChannelValue;
  destination: string;
  /** EMAIL only, untagged: the email service adds [STAGING]/[DEV] when it sends. */
  subject: string | null;
  body: string;
  replyTo: string | null;
  attempts: number;
  lastError: string | null;
}

export interface NotificationOutboxRow extends NotificationOutboxInput {
  id: string;
  vendorId: string;
  createdAt: Date;
}

export async function insertNotificationOutbox(
  prisma: Db,
  vendorId: string,
  input: NotificationOutboxInput,
): Promise<void> {
  await prisma.notificationOutbox.create({ data: { vendorId, ...input } });
}

/** One store's queued rows, oldest first. */
export async function listNotificationOutbox(
  prisma: Db,
  vendorId: string,
  take: number,
): Promise<NotificationOutboxRow[]> {
  return prisma.notificationOutbox.findMany({
    where: { vendorId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
  });
}

export async function deleteNotificationOutboxRow(
  prisma: Db,
  vendorId: string,
  id: string,
): Promise<void> {
  await prisma.notificationOutbox.deleteMany({ where: { id, vendorId } });
}

export async function recordNotificationOutboxFailure(
  prisma: Db,
  vendorId: string,
  id: string,
  attempts: number,
  lastError: string,
): Promise<void> {
  await prisma.notificationOutbox.update({
    where: { id, vendorId },
    data: { attempts, lastError },
  });
}

export async function countNotificationOutbox(prisma: Db, vendorId: string): Promise<number> {
  return prisma.notificationOutbox.count({ where: { vendorId } });
}
