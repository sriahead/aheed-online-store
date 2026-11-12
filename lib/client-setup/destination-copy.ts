import type { DestinationUnavailableReason } from "@/lib/email/destinations";

/**
 * #1392 — why Client Setup could not read the Cloudflare destination addresses. The long form sits
 * under the Forward to fallback field; the short form is the status card's "Verified mailboxes" row.
 * A plain module so both the server page and the client form can import the strings.
 */

export const DESTINATIONS_UNAVAILABLE_MESSAGE: Record<DestinationUnavailableReason, string> = {
  "not-configured":
    "Verified mailboxes are not available: Cloudflare credentials are not set for this environment.",
  forbidden:
    "Verified mailboxes are not available: the Cloudflare token lacks Email Routing Addresses Read.",
  error: "Verified mailboxes are not available: Cloudflare could not be reached.",
};

export const DESTINATIONS_UNAVAILABLE_SHORT: Record<DestinationUnavailableReason, string> = {
  "not-configured": "credentials not set",
  forbidden: "token lacks Email Routing Addresses Read",
  error: "Cloudflare could not be reached",
};

/**
 * #1546 — shown under Receiving addresses in allowlist mode (staging), because the email policy
 * accepts a saved forward-to mailbox without EMAIL_ALLOWED_RECIPIENTS.
 */
export const ALLOWLIST_FORWARD_NOTE =
  "Staging only mails allowed addresses. Each forward-to mailbox below counts as allowed while its receiving address exists, and the test email always reaches your own address.";
