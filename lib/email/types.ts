/**
 * Shared shapes for the provider-agnostic email port (#1217). `lib/email.ts` is the only module
 * callers import; the adapters in this directory see a message whose sender and recipient have
 * already been resolved and allowed, so each adapter's only job is delivery.
 */

export interface EmailSender {
  name: string;
  email: string;
}

/** What a caller hands to `EmailService.send`. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  /** The vendor the mail is sent on behalf of. Omitted means the platform itself. */
  sender?: EmailSender;
}

/** What an adapter delivers: the From is final, and `replyTo` is set only when R5 says so. */
export interface ResolvedEmail {
  from: EmailSender;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
}

export type EmailSendResult =
  { status: "sent" } | { status: "skipped"; reason: string } | { status: "failed"; reason: string };

export interface EmailAdapter {
  readonly name: string;
  /** Never throws: every failure comes back as `{ status: "failed" }`. */
  deliver(message: ResolvedEmail): Promise<EmailSendResult>;
}

/** The subset of Cloudflare's `SendEmail` binding the adapter uses, so tests can fake it. */
export interface SendEmailBinding {
  send(message: {
    from: EmailSender;
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
  }): Promise<unknown>;
}
