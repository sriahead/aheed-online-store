import type { NotificationMessage } from "@/lib/notifications/dispatch";
import type { AbandonedCheckoutRow } from "@/lib/repositories/abandoned-checkouts";
import { customerOrderHref } from "@/lib/order-notifications/links";
import type { EmailBrand } from "@/lib/email/layout/brand";
import { buildRecoveryEmail, type RecoveryCode } from "./email";
import {
  isOfferableCode,
  reminderBlock,
  REMINDER_BLOCK_COPY,
  type OfferableCode,
  type ReminderBlock,
} from "./eligibility";

/**
 * #1554 — the "Send reminder" action, with every collaborator injected so its rules are tested
 * without a request, a database or a provider. `lib/abandoned-checkouts-service.ts` binds them.
 *
 * Order is fixed: find the checkout (this store's, actually abandoned), re-check eligibility on the
 * server (the page's disabled button proves nothing), validate the code, CLAIM the reminder, then
 * send. Claiming first is what makes a double click or two admins send one email, not two; a send
 * that fails after the claim is queued by the dispatcher for retry, so the claim is never wasted.
 */

export interface StoreCode extends OfferableCode, RecoveryCode {
  id: string;
}

export interface RemindDeps {
  find(orderNumber: string): Promise<AbandonedCheckoutRow | null>;
  hasConsent(userId: string): Promise<boolean>;
  listCodes(): Promise<StoreCode[]>;
  claim(input: {
    orderId: string;
    sentByUserId: string;
    discountCode: string | null;
  }): Promise<"claimed" | "already-sent">;
  loadStore(): Promise<{
    sender: { name: string; email: string };
    baseUrl: string | null;
    brand?: EmailBrand;
  }>;
  send(messages: readonly NotificationMessage[]): Promise<void>;
  now(): Date;
}

export type RemindResult = { ok: true } | { ok: false; error: string };

export const REMIND_COPY = {
  notFound: "That abandoned checkout could not be found.",
  badCode: "That discount code can't be offered right now. Pick another or send without one.",
} as const;

function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export async function sendAbandonedCheckoutReminder(
  input: { orderNumber: string; staffUserId: string; discountCodeId: string | null },
  deps: RemindDeps,
): Promise<RemindResult> {
  const row = await deps.find(input.orderNumber);
  if (!row) return { ok: false, error: REMIND_COPY.notFound };

  const hasConsent = row.userId ? await deps.hasConsent(row.userId) : false;
  const now = deps.now();
  const block: ReminderBlock | null = reminderBlock(
    {
      abandonedAt: row.abandonedAt,
      userId: row.userId,
      email: row.email,
      hasConsent,
      reminderSentAt: row.reminder?.sentAt ?? null,
    },
    now,
  );
  if (block) return { ok: false, error: REMINDER_BLOCK_COPY[block] };

  let code: StoreCode | null = null;
  if (input.discountCodeId) {
    code = (await deps.listCodes()).find((c) => c.id === input.discountCodeId) ?? null;
    if (!code || !isOfferableCode(code, now)) return { ok: false, error: REMIND_COPY.badCode };
  }

  const claimed = await deps.claim({
    orderId: row.orderId,
    sentByUserId: input.staffUserId,
    discountCode: code?.code ?? null,
  });
  if (claimed === "already-sent") {
    return { ok: false, error: REMINDER_BLOCK_COPY["already-sent"] };
  }

  const store = await deps.loadStore();
  const { subject, html, text } = buildRecoveryEmail({
    storeName: store.sender.name,
    brand: store.brand,
    firstName: firstName(row.customerName),
    items: row.items,
    totalPence: row.totalPence,
    orderHref: store.baseUrl ? customerOrderHref(store.baseUrl, row) : null,
    preferencesHref: store.baseUrl ? `${store.baseUrl}/account/data` : null,
    code,
  });
  await deps.send([
    {
      channel: "EMAIL",
      // `reminderBlock` returned null, so the email is present.
      destination: row.email as string,
      subject,
      body: html,
      text,
      sender: store.sender,
      log: { audience: "CUSTOMER", event: "ABANDONED_CHECKOUT_REMINDER" },
    },
  ]);
  return { ok: true };
}
