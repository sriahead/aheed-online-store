import type { EmailAdapter, ResolvedEmail, SendEmailBinding } from "./types";

/**
 * Cloudflare Email Service adapter (#1217): the Worker's `EMAIL` send_email binding. No API key —
 * the binding is the credential, declared per environment in wrangler.toml. Sending to arbitrary
 * recipients needs the From domain onboarded in Email Sending; until then Cloudflare rejects the
 * send, which comes back here as `failed` and is logged by the port.
 */
export function createCloudflareAdapter(binding: SendEmailBinding | undefined): EmailAdapter {
  return {
    name: "cloudflare",
    async deliver(message: ResolvedEmail) {
      if (!binding) {
        return { status: "failed", reason: "the EMAIL send_email binding is not configured" };
      }
      try {
        await binding.send({
          from: { name: message.from.name, email: message.from.email },
          to: message.to,
          subject: message.subject,
          html: message.html,
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        });
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
