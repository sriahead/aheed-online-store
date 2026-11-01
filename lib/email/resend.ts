import type { EmailAdapter, ResolvedEmail } from "./types";

/**
 * Resend adapter — the retired provider, kept selectable as a fallback (#1217, owner 2026-11-01):
 * `EMAIL_PROVIDER=resend` plus `RESEND_API_KEY` restores it with no code change. Plain `fetch`, no
 * SDK, for the same Workers-bundle-size reason as lib/storage.ts's aws4fetch choice.
 */
export function createResendAdapter(apiKey: string | undefined): EmailAdapter {
  return {
    name: "resend",
    async deliver(message: ResolvedEmail) {
      if (!apiKey) {
        return { status: "failed", reason: "RESEND_API_KEY is not configured" };
      }
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: `${message.from.name} <${message.from.email}>`,
            to: message.to,
            subject: message.subject,
            html: message.html,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
        });
        if (!res.ok) {
          return { status: "failed", reason: `${res.status} ${await res.text()}` };
        }
        return { status: "sent" };
      } catch (error) {
        return {
          status: "failed",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
