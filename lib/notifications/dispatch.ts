import type { EmailSender, EmailService } from "@/lib/email";
import type { OrderAlertChannelAdapter } from "@/lib/order-alert/channels";
import type { NotificationOutboxInput } from "@/lib/repositories/notification-outbox";

/**
 * #1435 R3 — send first, queue only on failure.
 *
 * Every order-event message (customer or owner, email or Telegram) passes through here once. A
 * `sent` or `skipped` result stores nothing, so the normal path writes nothing to the database; a
 * `failed` result, or a send that throws, becomes one `NotificationOutbox` row for the retry job
 * (`lib/notifications/outbox.ts`) and sets the scheduler's pending marker once per call. The shape
 * is `#1409`'s contact outbox, minus its email-only columns.
 *
 * Never rejects: the order change that produced these messages is already committed, and a
 * confirmed payment or a delivery that happened must not be undone by a provider or a database.
 */

export type NotificationAudience = "CUSTOMER" | "OWNER";

export interface NotificationMessage {
  channel: "EMAIL" | "TELEGRAM";
  /** An email address or a Telegram chat id. Never logged. */
  destination: string;
  /** Email HTML, or Telegram plain text. Never logged. */
  body: string;
  /** EMAIL only. Untagged: the email service adds [STAGING]/[DEV]. Never logged. */
  subject?: string;
  replyTo?: string;
  /** EMAIL only: the vendor's sender. Not stored — the retry job resolves it again by vendor. */
  sender?: EmailSender;
  log: { audience: NotificationAudience; event: string };
}

export interface DispatchDeps {
  email: EmailService;
  telegram: OrderAlertChannelAdapter;
  enqueue(vendorId: string, row: NotificationOutboxInput): Promise<void>;
  markPending(): Promise<void>;
  log(line: string): void;
}

type Outcome = { status: "sent" } | { status: "skipped" | "failed"; reason: string };

const REASON_MAX = 200;

/**
 * A provider's error text can echo the recipient ("address not verified: jo@…"), so anything shaped
 * like an address is masked before a reason reaches a log line, and the reason is capped. Whitespace
 * runs collapse to one space: a provider can return a multi-line error (the email config's zod
 * error is pretty-printed JSON), and R7's per-message line must stay one line (#1435 validation
 * pass 1, F1).
 */
export function safeReason(reason: string): string {
  const masked = reason
    .replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, "<address>")
    .replace(/\s+/g, " ")
    .trim();
  return masked.length > REASON_MAX ? `${masked.slice(0, REASON_MAX)}…` : masked;
}

/** R7 — the one per-message line. Never a destination, subject, body or name. */
export function notificationLogLine(
  vendorId: string,
  message: Pick<NotificationMessage, "channel" | "log">,
  status: "sent" | "skipped" | "queued",
  reason?: string,
): string {
  const base =
    `notification vendorId=${vendorId} channel=${message.channel} ` +
    `audience=${message.log.audience} event=${message.log.event} status=${status}`;
  return reason === undefined ? base : `${base} reason=${safeReason(reason)}`;
}

async function sendOne(deps: DispatchDeps, message: NotificationMessage): Promise<Outcome> {
  try {
    if (message.channel === "EMAIL") {
      return await deps.email.send({
        to: message.destination,
        subject: message.subject ?? "",
        html: message.body,
        sender: message.sender,
        replyTo: message.replyTo,
      });
    }
    return await deps.telegram.send(message.destination, message.body);
  } catch (error) {
    // The name only: a thrown message can carry a URL with a token in it (#1390).
    return {
      status: "failed",
      reason: `send threw: ${error instanceof Error ? error.name : "unknown"}`,
    };
  }
}

export async function dispatchNotifications(
  deps: DispatchDeps,
  vendorId: string,
  messages: readonly NotificationMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  // Concurrently: a slow Telegram reply (5 s adapter timeout) then delays a Stripe webhook by one
  // timeout at most, not one per message.
  const outcomes = await Promise.all(messages.map((m) => sendOne(deps, m)));

  let queued = false;
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    const outcome = outcomes[i];
    if (outcome.status === "sent") {
      deps.log(notificationLogLine(vendorId, message, "sent"));
      continue;
    }
    if (outcome.status === "skipped") {
      deps.log(notificationLogLine(vendorId, message, "skipped", outcome.reason));
      continue;
    }
    try {
      await deps.enqueue(vendorId, {
        channel: message.channel,
        destination: message.destination,
        subject: message.channel === "EMAIL" ? (message.subject ?? "") : null,
        body: message.body,
        replyTo: message.replyTo ?? null,
        attempts: 1,
        lastError: outcome.reason,
      });
      queued = true;
      deps.log(notificationLogLine(vendorId, message, "queued", outcome.reason));
    } catch (error) {
      deps.log(
        `notification vendorId=${vendorId} channel=${message.channel} ` +
          `audience=${message.log.audience} event=${message.log.event} status=lost ` +
          `reason=${safeReason(`send failed (${outcome.reason}) and queueing threw ${error instanceof Error ? error.name : "unknown"}`)}`,
      );
    }
  }

  if (queued) {
    try {
      await deps.markPending();
    } catch (error) {
      deps.log(
        `notification vendorId=${vendorId} marker failed: ${error instanceof Error ? error.name : "unknown"}`,
      );
    }
  }
}
