import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  DEFAULT_PLATFORM_NAME,
  getAppEnvironment,
  getEmailEnv,
  getPlatformBrandingEnv,
  readOptional,
  type EmailEnv,
} from "./config";
import { createCloudflareAdapter } from "./email/cloudflare";
import { withEnvironmentTag } from "./email/environment-tag";
import { htmlToText } from "./email/layout/text";
import { createLogAdapter } from "./email/log";
import { isRecipientAllowed, resolveSender } from "./email/policy";
import { createResendAdapter } from "./email/resend";
import type { EmailAdapter, EmailSendResult, OutgoingEmail, SendEmailBinding } from "./email/types";

export type { EmailSendResult, EmailSender, OutgoingEmail } from "./email/types";

/**
 * EmailService port (#1217). Every caller imports this module only; each provider is one adapter
 * file under lib/email/, picked by EMAIL_PROVIDER. Adding a provider is one adapter plus one enum
 * value in lib/config.ts — no caller changes.
 *
 * `send` never throws and returns what happened, so a confirmed payment or an auth flow never
 * depends on a provider being reachable, and the Client Setup dashboard's test email can still
 * report the outcome.
 */
export interface EmailService {
  send(params: OutgoingEmail): Promise<EmailSendResult>;
}

export type EmailProviderName = "cloudflare" | "resend" | "log";

/** The `EMAIL` send_email binding from the Worker context, or undefined outside a Worker. */
export function getEmailBinding(): SendEmailBinding | undefined {
  try {
    const { env } = getCloudflareContext();
    const binding = (env as Record<string, unknown>).EMAIL;
    return binding && typeof (binding as SendEmailBinding).send === "function"
      ? (binding as SendEmailBinding)
      : undefined;
  } catch {
    return undefined;
  }
}

/** R2. Explicit EMAIL_PROVIDER wins; unset means Cloudflare when the binding exists, else log. */
export function selectEmailProvider(
  provider: EmailEnv["EMAIL_PROVIDER"],
  hasBinding: boolean,
): EmailProviderName {
  if (provider) return provider;
  return hasBinding ? "cloudflare" : "log";
}

function createAdapter(
  name: EmailProviderName,
  env: EmailEnv,
  binding: SendEmailBinding | undefined,
): EmailAdapter {
  switch (name) {
    case "cloudflare":
      return createCloudflareAdapter(binding);
    case "resend":
      return createResendAdapter(env.RESEND_API_KEY);
    case "log":
      return createLogAdapter();
  }
}

/**
 * #1546 — allowlist mode's second chance for a recipient EMAIL_ALLOWED_RECIPIENTS refused: Client
 * Setup's test email to the signed-in admin, or a mailbox a store saved as a receiving address's
 * forward-to (so removing the address withdraws it). The Worker cannot edit its own secret, so the
 * policy reads what a platform admin already saved. Fails closed: a lookup error keeps the skip.
 * Imported lazily so open mode (production) and every caller that never reaches here load no client.
 */
async function isAllowedByClientSetup(params: OutgoingEmail): Promise<boolean> {
  if (params.recipientIsSignedInAdmin) return true;
  try {
    const [{ getPrisma }, { isRegisteredForwardTo }] = await Promise.all([
      import("./db"),
      import("./repositories/inbound-address"),
    ]);
    return await isRegisteredForwardTo(getPrisma(), params.to);
  } catch (error) {
    console.error(
      `email allowlist lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

export function getPlatformSenderName(): string {
  return readOptional(getPlatformBrandingEnv)?.PLATFORM_NAME ?? DEFAULT_PLATFORM_NAME;
}

export function getEmailService(): EmailService {
  return {
    async send(params) {
      const { to, subject: untagged, html, sender, replyTo: replyToOverride } = params;
      // #1564 R4 — every email carries a plain-text part; a caller without one gets it derived.
      const text = params.text?.trim() ? params.text : htmlToText(html);
      // #1409 — first, so the adapter and every log line below see the tagged subject.
      const subject = withEnvironmentTag(untagged, getAppEnvironment());
      let env: EmailEnv;
      try {
        env = getEmailEnv();
      } catch (error) {
        const reason = `email configuration is invalid: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`email send failed (${reason}): ${subject}`);
        return { status: "failed", reason };
      }

      if (
        !isRecipientAllowed({
          to,
          mode: env.EMAIL_RECIPIENT_MODE,
          allowedRecipients: env.EMAIL_ALLOWED_RECIPIENTS,
        }) &&
        !(await isAllowedByClientSetup(params))
      ) {
        const reason = "recipient is not on EMAIL_ALLOWED_RECIPIENTS (recipient mode is allowlist)";
        console.warn(`email send skipped (${reason}): ${subject}`);
        return { status: "skipped", reason };
      }

      const binding = getEmailBinding();
      const adapter = createAdapter(
        selectEmailProvider(env.EMAIL_PROVIDER, Boolean(binding)),
        env,
        binding,
      );

      if (adapter.name !== "log" && !env.EMAIL_FROM) {
        const reason = "EMAIL_FROM is not configured";
        console.error(`email send failed (${reason}): ${subject}`);
        return { status: "failed", reason };
      }

      const resolved = resolveSender({
        sender,
        verifiedDomains: env.EMAIL_VERIFIED_DOMAINS,
        platformFrom: env.EMAIL_FROM ?? "",
        platformName: getPlatformSenderName(),
      });

      const from = resolved.from;
      const replyTo = replyToOverride?.trim() ? replyToOverride.trim() : resolved.replyTo;

      const result = await adapter.deliver({ from, replyTo, to, subject, html, text });
      if (result.status === "failed") {
        console.error(`email send failed via ${adapter.name}: ${result.reason}`);
      } else if (result.status === "skipped") {
        console.error(`email send skipped via ${adapter.name} (${result.reason}): ${subject}`);
      }
      return result;
    },
  };
}
