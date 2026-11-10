/**
 * Quick links shown in the Client Setup "Order alerts" card, next to the Telegram recipients.
 *
 * Kept in a plain module (not the page, not a `"use server"` file) so the list is testable and so
 * the page stays a layout. Every external link points at an official Telegram domain; the one
 * internal link opens the platform admin guide's Telegram section in the in-app runbook.
 *
 * Deliberately absent: any link containing a bot token. `getUpdates` is linked as documentation
 * only — the real URL embeds the token and must never be pasted into the page or sent to a client.
 */

export interface TelegramQuickLink {
  label: string;
  href: string;
  /** One line explaining when to use it. */
  hint: string;
  /** True when the link is safe to forward to the client store's owner or staff. */
  shareable: boolean;
}

export const TELEGRAM_RUNBOOK_HREF =
  "/staff/runbook?doc=docs/platform-admin-guide/platform-admin-guide.md&q=Telegram";

export const TELEGRAM_QUICK_LINKS: readonly TelegramQuickLink[] = [
  {
    label: "Setup guide (runbook)",
    href: TELEGRAM_RUNBOOK_HREF,
    hint: "End-to-end steps, boundary cases and troubleshooting.",
    shareable: false,
  },
  {
    label: "@BotFather",
    href: "https://t.me/BotFather",
    hint: "Create a bot (/newbot), rename it, set its picture, or revoke a leaked token.",
    shareable: false,
  },
  {
    label: "Get Telegram",
    href: "https://telegram.org/apps",
    hint: "Apps for phone and desktop, for a client who does not use Telegram yet.",
    shareable: true,
  },
  {
    label: "Telegram Web",
    href: "https://web.telegram.org/a/",
    hint: "Open the group or channel; the chat ID is the number after # in the address bar.",
    shareable: true,
  },
  {
    label: "Create a channel or group (FAQ)",
    href: "https://telegram.org/faq#q-how-do-i-create-a-channel",
    hint: "Telegram's own instructions, to send to a client creating their alerts chat.",
    shareable: true,
  },
  {
    label: "Bot API: getUpdates",
    href: "https://core.telegram.org/bots/api#getupdates",
    hint: "How the chat ID lookup works. The real URL contains the token; never share it.",
    shareable: false,
  },
  {
    label: "Bot API: privacy mode",
    href: "https://core.telegram.org/bots/features#privacy-mode",
    hint: "Why a group needs /start@<bot username> before getUpdates shows anything.",
    shareable: false,
  },
  {
    label: "@BotSupport",
    href: "https://t.me/BotSupport",
    hint: "Telegram's support for bot problems the steps above do not fix.",
    shareable: false,
  },
] as const;
