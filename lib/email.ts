import { getEnv } from "./config";

/**
 * EmailService port. Transactional email via Resend's REST API using plain
 * `fetch` — no SDK, same Workers-bundle-size reasoning as lib/storage.ts's
 * aws4fetch choice over the AWS SDK. Swappable for SES/SendGrid by adapter.
 */
export interface EmailService {
  send(params: { to: string; subject: string; html: string }): Promise<void>;
}

export function getEmailService(): EmailService {
  const env = getEnv();

  return {
    async send({ to, subject, html }) {
      if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
        console.error(
          `email send skipped (no RESEND_API_KEY/RESEND_FROM_EMAIL configured): ${subject} -> ${to}`,
        );
        return;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to, subject, html }),
      });

      if (!res.ok) {
        console.error(`email send failed: ${res.status} ${await res.text()}`);
      }
    },
  };
}
