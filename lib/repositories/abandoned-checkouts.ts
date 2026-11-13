import type { getPrisma } from "@/lib/db";
import { ABANDONED_NOTE_PREFIX } from "@/lib/abandoned-checkout/eligibility";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";

/**
 * #1554 — abandoned checkouts and the one recovery reminder each may get. Every export takes its
 * Prisma client and `vendorId` explicitly and reads no request context (CLAUDE.md, repository
 * layer); `lib/abandoned-checkouts-service.ts` is the request-scoped half.
 *
 * Reads only: an abandoned checkout is an existing CANCELLED order carrying the expiry note
 * (`ABANDONED_NOTE_PREFIX`), so nothing new is recorded when a checkout is abandoned.
 */

type Db = ReturnType<typeof getPrisma>;

const abandonedSelect = {
  id: true,
  orderNumber: true,
  userId: true,
  confirmationToken: true,
  guestEmail: true,
  totalPence: true,
  createdAt: true,
  user: { select: { email: true, name: true } },
  items: { select: { productName: true, quantity: true, lineTotalPence: true } },
  statusEvents: {
    where: { status: "CANCELLED" as const, note: { startsWith: ABANDONED_NOTE_PREFIX } },
    orderBy: { createdAt: "asc" as const },
    take: 1,
    select: { createdAt: true },
  },
  abandonedReminder: {
    select: { sentAt: true, discountCode: true, sentBy: { select: { name: true } } },
  },
};

export interface AbandonedCheckoutRow {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  confirmationToken: string | null;
  /** The account's email for a member, the checkout email for a guest. */
  email: string | null;
  customerName: string | null;
  totalPence: number;
  items: { productName: string; quantity: number; lineTotalPence: number }[];
  /** When the checkout session expired (the cancellation event). */
  abandonedAt: Date;
  reminder: { sentAt: Date; discountCode: string | null; sentByName: string | null } | null;
}

type Selected = {
  id: string;
  orderNumber: string;
  userId: string | null;
  confirmationToken: string | null;
  guestEmail: string | null;
  totalPence: number;
  createdAt: Date;
  user: { email: string; name: string } | null;
  items: { productName: string; quantity: number; lineTotalPence: number }[];
  statusEvents: { createdAt: Date }[];
  abandonedReminder: {
    sentAt: Date;
    discountCode: string | null;
    sentBy: { name: string } | null;
  } | null;
};

function toRow(order: Selected): AbandonedCheckoutRow {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    confirmationToken: order.confirmationToken,
    email: order.user?.email ?? order.guestEmail,
    customerName: order.user?.name ?? null,
    totalPence: order.totalPence,
    items: order.items,
    abandonedAt: order.statusEvents[0]?.createdAt ?? order.createdAt,
    reminder: order.abandonedReminder
      ? {
          sentAt: order.abandonedReminder.sentAt,
          discountCode: order.abandonedReminder.discountCode,
          sentByName: order.abandonedReminder.sentBy?.name ?? null,
        }
      : null,
  };
}

function abandonedWhere(vendorId: string) {
  return {
    vendorId,
    status: "CANCELLED" as const,
    statusEvents: {
      some: { status: "CANCELLED" as const, note: { startsWith: ABANDONED_NOTE_PREFIX } },
    },
  };
}

/** Abandoned checkouts placed since `since`, newest first, at most 200. */
export async function listAbandonedCheckouts(
  prisma: Db,
  vendorId: string,
  since: Date,
): Promise<AbandonedCheckoutRow[]> {
  const orders = await prisma.order.findMany({
    where: { ...abandonedWhere(vendorId), createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: abandonedSelect,
  });
  return (orders as Selected[]).map(toRow);
}

/** One abandoned checkout of this store, or null (not this store's, or not abandoned). */
export async function findAbandonedCheckout(
  prisma: Db,
  vendorId: string,
  orderNumber: string,
): Promise<AbandonedCheckoutRow | null> {
  const order = await prisma.order.findFirst({
    where: { ...abandonedWhere(vendorId), orderNumber },
    select: abandonedSelect,
  });
  return order ? toRow(order as Selected) : null;
}

/**
 * Claims the checkout's single reminder BEFORE anything is sent. A singular, childless create, so
 * `getPrisma()` is fine (CLAUDE.md). A second claim, by a double click or a second admin, hits the
 * unique `orderId` and returns "already-sent"; `isUniqueViolation` accepts both adapters' codes.
 */
export async function claimAbandonedCheckoutReminder(
  prisma: Db,
  vendorId: string,
  input: { orderId: string; sentByUserId: string; discountCode: string | null },
): Promise<"claimed" | "already-sent"> {
  try {
    await prisma.abandonedCheckoutReminder.create({
      data: {
        vendorId,
        orderId: input.orderId,
        sentByUserId: input.sentByUserId,
        discountCode: input.discountCode,
      },
    });
    return "claimed";
  } catch (error) {
    if (isUniqueViolation(error)) return "already-sent";
    throw error;
  }
}
