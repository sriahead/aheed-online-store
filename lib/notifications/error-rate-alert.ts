import type { AppEnvironment, PlatformAlertChat } from "@/lib/config";
import type { ErrorRateSummary } from "@/lib/error-rate";
import { withEnvironmentTag } from "@/lib/email/environment-tag";
import type { AlertSendResult } from "@/lib/order-alert/channels";

/**
 * #1552 R7 — the error-rate breach as a Telegram message to the platform's alert chat, closing the
 * channel question #437 left open. Injectable so the route's behaviour is tested without KV,
 * Telegram or a clock. Counts only: an error message can carry customer data, so none is sent.
 */

export function errorRateAlertText(
  summary: ErrorRateSummary,
  origin: string,
  environment: AppEnvironment,
): string {
  return [
    withEnvironmentTag("Error rate alert", environment),
    `${summary.count} errors in the last ${Math.round(summary.windowMs / 60000)} minutes (threshold ${summary.threshold})`,
    `Since: ${summary.since}`,
    `${origin}/staff/errors`,
  ].join("\n");
}

export interface ErrorRateAlertDeps {
  chat: PlatformAlertChat;
  environment: AppEnvironment;
  claim(now: Date): Promise<boolean>;
  send(chatId: string, text: string): Promise<AlertSendResult>;
  now(): Date;
  log(line: string): void;
}

/** Never rejects: the job's response and its log line must not depend on Telegram. */
export async function sendErrorRateAlert(
  summary: ErrorRateSummary,
  origin: string,
  deps: ErrorRateAlertDeps,
): Promise<void> {
  if (!summary.breached || deps.chat.status !== "set") return;
  try {
    if (!(await deps.claim(deps.now()))) {
      deps.log("error-rate telegram: skipped (cooldown)");
      return;
    }
    const result = await deps.send(
      deps.chat.chatId,
      errorRateAlertText(summary, origin, deps.environment),
    );
    deps.log(
      result.status === "sent"
        ? "error-rate telegram: sent"
        : `error-rate telegram: ${result.status} (${result.reason})`,
    );
  } catch (error) {
    deps.log(`error-rate telegram: failed (${error instanceof Error ? error.name : "unknown"})`);
  }
}
