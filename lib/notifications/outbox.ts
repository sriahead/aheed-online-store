import type { EmailSender, EmailService } from "@/lib/email";
import type { OrderAlertChannelAdapter } from "@/lib/order-alert/channels";
import { NOTIFICATION_OUTBOX_RETENTION_HOURS } from "@/lib/data-retention";
import type { NotificationOutboxRow } from "@/lib/repositories/notification-outbox";
import { safeReason } from "./dispatch";

/**
 * #1435 R5 — the order-notification retry run, called by `/api/jobs/retry-notification-outbox`.
 *
 * The same shape as `runContactOutbox` (`lib/contact-service.ts`, #1409): up to 50 rows oldest
 * first within each store, vendor-scoped queries, `sent`/`skipped` deleted, `failed` counted, and
 * the scheduler's marker cleared only once every store's queue is empty. The differences are the
 * channel (an EMAIL row resends through the email service with the vendor's sender, resolved again
 * here because it is not stored; a TELEGRAM row through the #1390 adapter) and the expiry: 24 hours,
 * not 7 days, because a stale order update is worse than none.
 *
 * Logs name only a row's id, its store and its channel — never its destination, subject or body.
 */

export const NOTIFICATION_OUTBOX_BATCH = 50;
export const NOTIFICATION_OUTBOX_MAX_AGE_MS = NOTIFICATION_OUTBOX_RETENTION_HOURS * 60 * 60 * 1000;

export interface NotificationOutboxSummary {
  sent: number;
  failed: number;
  expired: number;
  remaining: number;
}

export interface NotificationOutboxDeps {
  listVendorIds(): Promise<string[]>;
  list(vendorId: string, take: number): Promise<NotificationOutboxRow[]>;
  remove(vendorId: string, id: string): Promise<void>;
  recordFailure(vendorId: string, id: string, attempts: number, lastError: string): Promise<void>;
  count(vendorId: string): Promise<number>;
  /** The store's email sender; undefined falls back to the platform sender. */
  senderFor(vendorId: string): Promise<EmailSender | undefined>;
  email: EmailService;
  telegram: OrderAlertChannelAdapter;
  mark(): Promise<void>;
  clear(): Promise<void>;
  now(): Date;
  log(line: string): void;
}

async function resend(
  deps: NotificationOutboxDeps,
  row: NotificationOutboxRow,
  sender: EmailSender | undefined,
): Promise<{ status: "sent" } | { status: "skipped" | "failed"; reason: string }> {
  try {
    if (row.channel === "EMAIL") {
      return await deps.email.send({
        to: row.destination,
        subject: row.subject ?? "",
        html: row.body,
        sender,
        replyTo: row.replyTo ?? undefined,
      });
    }
    return await deps.telegram.send(row.destination, row.body);
  } catch (error) {
    return {
      status: "failed",
      reason: `send threw: ${error instanceof Error ? error.name : "unknown"}`,
    };
  }
}

export async function runNotificationOutbox(
  deps: NotificationOutboxDeps,
): Promise<NotificationOutboxSummary> {
  const summary = { sent: 0, failed: 0, expired: 0, remaining: 0 };
  let budget = NOTIFICATION_OUTBOX_BATCH;
  const cutoff = deps.now().getTime() - NOTIFICATION_OUTBOX_MAX_AGE_MS;

  const vendorIds = await deps.listVendorIds();
  for (const vendorId of vendorIds) {
    if (budget <= 0) break;
    const rows = await deps.list(vendorId, budget);
    if (rows.length === 0) continue;
    budget -= rows.length;

    let sender: EmailSender | undefined;
    if (rows.some((r) => r.channel === "EMAIL")) {
      try {
        sender = await deps.senderFor(vendorId);
      } catch {
        sender = undefined;
      }
    }

    for (const row of rows) {
      if (row.createdAt.getTime() < cutoff) {
        await deps.remove(vendorId, row.id);
        deps.log(
          `notification outbox: expired unsent after ${NOTIFICATION_OUTBOX_RETENTION_HOURS} hours (id ${row.id}, vendor ${vendorId})`,
        );
        summary.expired += 1;
        continue;
      }
      const result = await resend(deps, row, sender);
      if (result.status === "failed") {
        await deps.recordFailure(vendorId, row.id, row.attempts + 1, result.reason);
        deps.log(
          `notification outbox: retry failed (id ${row.id}, vendor ${vendorId}, channel ${row.channel}, attempt ${row.attempts + 1}): ${safeReason(result.reason)}`,
        );
        summary.failed += 1;
      } else {
        await deps.remove(vendorId, row.id);
        summary.sent += 1;
      }
    }
  }

  // Per store, so every query stays vendor-scoped (tests/repository-vendor-scoping.test.ts).
  for (const vendorId of vendorIds) summary.remaining += await deps.count(vendorId);
  if (summary.remaining === 0) await deps.clear();
  else await deps.mark();
  return summary;
}
