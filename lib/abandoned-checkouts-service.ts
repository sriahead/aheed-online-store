import { getPrisma } from "@/lib/db";
import {
  ABANDONED_LIST_DAYS,
  isOfferableCode,
  reminderBlock,
  REMINDER_BLOCK_COPY,
} from "@/lib/abandoned-checkout/eligibility";
import {
  sendAbandonedCheckoutReminder,
  type RemindResult,
  type StoreCode,
} from "@/lib/abandoned-checkout/remind";
import {
  loadVendorNotificationContext,
  sendVendorNotifications,
} from "@/lib/order-notifications-service";
import {
  claimAbandonedCheckoutReminder,
  findAbandonedCheckout,
  listAbandonedCheckouts,
} from "@/lib/repositories/abandoned-checkouts";
import { listCodes } from "@/lib/repositories/discounts";
import { hasEffectiveMarketingConsent } from "@/lib/repositories/marketing-consent";

/**
 * #1554 — the request-scoped half of abandoned checkouts. The caller passes the `vendorId` and staff
 * user that `requireVendorRole` resolved from the request; nothing here trusts a form for either.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function storeCodes(prisma: ReturnType<typeof getPrisma>, vendorId: string) {
  const codes = await listCodes(prisma, vendorId);
  return codes.map((c): StoreCode => ({
    id: c.id,
    code: c.code,
    kind: c.kind,
    value: c.value,
    minSubtotalPence: c.minSubtotalPence,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    isActive: c.isActive,
    remainingRedemptions: c.remainingRedemptions,
  }));
}

export interface AbandonedCheckoutView {
  orderNumber: string;
  abandonedAt: string;
  isGuest: boolean;
  customerName: string | null;
  itemCount: number;
  totalPence: number;
  hasConsent: boolean;
  reminder: { sentAt: string; discountCode: string | null; sentByName: string | null } | null;
  /** Null when "Send reminder" is available, else why not. */
  blockedReason: string | null;
}

export async function getAbandonedCheckoutsPage(vendorId: string): Promise<{
  rows: AbandonedCheckoutView[];
  codes: { id: string; label: string }[];
}> {
  const prisma = getPrisma();
  const now = new Date();
  const [rows, codes] = await Promise.all([
    listAbandonedCheckouts(
      prisma,
      vendorId,
      new Date(now.getTime() - ABANDONED_LIST_DAYS * DAY_MS),
    ),
    storeCodes(prisma, vendorId),
  ]);

  const userIds = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))];
  const consent = new Map(
    await Promise.all(
      userIds.map(
        async (id) => [id, await hasEffectiveMarketingConsent(prisma, vendorId, id)] as const,
      ),
    ),
  );

  return {
    rows: rows.map((r) => {
      const hasConsent = r.userId ? (consent.get(r.userId) ?? false) : false;
      const block = reminderBlock(
        {
          abandonedAt: r.abandonedAt,
          userId: r.userId,
          email: r.email,
          hasConsent,
          reminderSentAt: r.reminder?.sentAt ?? null,
        },
        now,
      );
      return {
        orderNumber: r.orderNumber,
        abandonedAt: r.abandonedAt.toISOString(),
        isGuest: r.userId === null,
        customerName: r.customerName,
        itemCount: r.items.reduce((sum, i) => sum + i.quantity, 0),
        totalPence: r.totalPence,
        hasConsent,
        reminder: r.reminder
          ? {
              sentAt: r.reminder.sentAt.toISOString(),
              discountCode: r.reminder.discountCode,
              sentByName: r.reminder.sentByName,
            }
          : null,
        blockedReason: block ? REMINDER_BLOCK_COPY[block] : null,
      };
    }),
    codes: codes.filter((c) => isOfferableCode(c, now)).map((c) => ({ id: c.id, label: c.code })),
  };
}

export async function remindAbandonedCheckout(input: {
  vendorId: string;
  staffUserId: string;
  orderNumber: string;
  discountCodeId: string | null;
}): Promise<RemindResult> {
  const prisma = getPrisma();
  const { vendorId } = input;
  return sendAbandonedCheckoutReminder(input, {
    find: (orderNumber) => findAbandonedCheckout(prisma, vendorId, orderNumber),
    hasConsent: (userId) => hasEffectiveMarketingConsent(prisma, vendorId, userId),
    listCodes: () => storeCodes(prisma, vendorId),
    claim: (claim) => claimAbandonedCheckoutReminder(prisma, vendorId, claim),
    loadStore: () => loadVendorNotificationContext(vendorId),
    send: (messages) => sendVendorNotifications(vendorId, messages),
    now: () => new Date(),
  });
}
