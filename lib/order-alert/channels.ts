import type { OrderAlertChannel } from "@prisma/client/wasm";
import type { TelegramBotToken } from "../config";

/**
 * #1390 R6 — the channel seam for order alerts.
 *
 * One adapter per `OrderAlertChannel` value. The registry is typed over the Prisma enum, so adding
 * `WHATSAPP` (#1424) without an adapter fails `typecheck` rather than silently dropping alerts.
 * Adapters never throw: a failed alert is reported, never allowed to break the email forwarding or
 * the contact form that triggered it.
 */

export type AlertSendResult =
  { status: "sent" } | { status: "skipped"; reason: string } | { status: "failed"; reason: string };

export interface OrderAlertChannelAdapter {
  send(destination: string, text: string): Promise<AlertSendResult>;
}

export type OrderAlertRegistry = Record<OrderAlertChannel, OrderAlertChannelAdapter>;

/** Typed over the enum too, so a new channel cannot render unlabelled in Client Setup. */
export const ORDER_ALERT_CHANNEL_LABEL: Record<OrderAlertChannel, string> = {
  TELEGRAM: "Telegram",
};

const TELEGRAM_API = "https://api.telegram.org";
const TELEGRAM_TIMEOUT_MS = 5000;

/**
 * Telegram Bot API `sendMessage`. The request URL contains the bot token, so a thrown error's
 * `message` (which can echo the URL) is never reported, only its `name`.
 */
export function telegramAdapter(
  token: TelegramBotToken,
  fetchImpl: typeof fetch = fetch,
): OrderAlertChannelAdapter {
  return {
    async send(destination, text) {
      if (token.status !== "set") return { status: "skipped", reason: "TELEGRAM_BOT_TOKEN unset" };
      let response: Response;
      try {
        response = await fetchImpl(`${TELEGRAM_API}/bot${token.token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: destination, text }),
          signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : "unknown";
        return { status: "failed", reason: `telegram request error: ${name}` };
      }

      let body: { ok?: unknown; description?: unknown } | null = null;
      try {
        body = (await response.json()) as { ok?: unknown; description?: unknown };
      } catch {
        body = null;
      }
      if (response.status === 200 && body?.ok === true) return { status: "sent" };
      const description =
        typeof body?.description === "string" ? body.description : "no description";
      return { status: "failed", reason: `telegram ${response.status}: ${description}` };
    },
  };
}

export function buildOrderAlertRegistry(
  token: TelegramBotToken,
  fetchImpl: typeof fetch = fetch,
): OrderAlertRegistry {
  return { TELEGRAM: telegramAdapter(token, fetchImpl) };
}
