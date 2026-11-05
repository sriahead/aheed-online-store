import type { OrderAlertChannel } from "@prisma/client/wasm";
import type { AppEnvironment } from "../config";
import { formatOrderAlert, type OrderAlertBrief } from "./brief";
import type { AlertSendResult, OrderAlertRegistry } from "./channels";

/**
 * #1390 R7 — send one order alert to every recipient a vendor has.
 *
 * Every collaborator is injected, so this runs from a test or a plain script with no request. It
 * NEVER throws: the email forwarding and the contact form that call it must not fail because an
 * alert did. NOTHING PERSONAL IS LOGGED: log lines carry the vendor id, channel and outcome only,
 * never the subject, the sender's name or the destination chat (the #1217 R22 rule).
 */

export interface OrderAlertRecipient {
  channel: OrderAlertChannel;
  destination: string;
}

export interface SendOrderAlertDeps {
  listRecipients(vendorId: string): Promise<OrderAlertRecipient[]>;
  registry: OrderAlertRegistry;
  environment: AppEnvironment;
  log(message: string): void;
}

export interface OrderAlertSummary {
  sent: number;
  skipped: number;
  failed: number;
}

export async function sendOrderAlert(
  deps: SendOrderAlertDeps,
  vendorId: string,
  brief: OrderAlertBrief,
): Promise<OrderAlertSummary> {
  const summary: OrderAlertSummary = { sent: 0, skipped: 0, failed: 0 };

  let recipients: OrderAlertRecipient[];
  try {
    recipients = await deps.listRecipients(vendorId);
  } catch {
    deps.log(`order alert vendorId=${vendorId} status=failed reason=recipients unreadable`);
    summary.failed += 1;
    return summary;
  }

  const text = formatOrderAlert(brief, deps.environment);
  for (const recipient of recipients) {
    let result: AlertSendResult;
    try {
      result = await deps.registry[recipient.channel].send(recipient.destination, text);
    } catch {
      result = { status: "failed", reason: "adapter threw" };
    }
    summary[result.status] += 1;
    deps.log(
      `order alert vendorId=${vendorId} channel=${recipient.channel} status=${result.status}` +
        (result.status === "sent" ? "" : ` reason=${result.reason}`),
    );
  }
  return summary;
}
