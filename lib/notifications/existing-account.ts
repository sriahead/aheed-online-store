import { escapeHtml } from "@/lib/html-escape";
import type { EmailSender, OutgoingEmail } from "@/lib/email/types";

/**
 * #1558 — the email a sign-up with an already-registered address sends to that address. Better
 * Auth answers such a sign-up with its generic "check your email" response so the form never
 * reveals who has an account; this tells only the inbox owner. It carries no token and no link that
 * changes the account. `lib/existing-account-signup-service.ts` binds the live pieces.
 */

/** Better Auth's provider id for an email + password login. */
const PASSWORD_PROVIDER = "credential";
const GOOGLE_PROVIDER = "google";

export function existingAccountEmail(input: {
  storeName: string;
  baseUrl: string;
  providers: readonly string[];
}): { subject: string; html: string } {
  const store = escapeHtml(input.storeName);
  const base = input.baseUrl.replace(/\/+$/, "");
  const hasPassword = input.providers.includes(PASSWORD_PROVIDER);
  const hasGoogle = input.providers.includes(GOOGLE_PROVIDER);
  // Neither recorded is unexpected; offer the password route so the holder is never stuck.
  const offerReset = hasPassword || !hasGoogle;

  const lines = [
    `<p>Someone, probably you, tried to create an account with ${store} using this email address. You already have an account, so nothing new was created.</p>`,
    `<p><a href="${base}/login">Sign in to ${store}</a></p>`,
  ];
  if (hasGoogle) lines.push(`<p>You can sign in with Google using this address.</p>`);
  if (offerReset) {
    lines.push(
      `<p>Forgotten your password? <a href="${base}/forgot-password">Reset it here</a>.</p>`,
    );
  }
  lines.push(
    `<p>If this wasn't you, you can ignore this email. Nothing has changed on your account.</p>`,
  );

  return { subject: `You already have an account with ${input.storeName}`, html: lines.join("\n") };
}

export interface ExistingAccountDeps {
  loadProviders(userId: string): Promise<readonly string[]>;
  resolveSender(): Promise<EmailSender | undefined>;
  defaultStoreName: string;
  send(email: OutgoingEmail): Promise<unknown>;
  log(line: string): void;
}

/** Never rejects: the sign-up response must not change, or an error would reveal the account. */
export async function notifyExistingAccountSignUp(
  user: { id: string; email: string },
  baseUrl: string | undefined,
  deps: ExistingAccountDeps,
): Promise<void> {
  // No host and no BETTER_AUTH_URL: the links would be broken, so send nothing.
  if (!baseUrl) {
    deps.log(`existing-account sign-up email skipped userId=${user.id}: no base URL`);
    return;
  }
  try {
    const [providers, sender] = await Promise.all([
      deps.loadProviders(user.id),
      deps.resolveSender(),
    ]);
    const { subject, html } = existingAccountEmail({
      storeName: sender?.name ?? deps.defaultStoreName,
      baseUrl,
      providers,
    });
    await deps.send({ to: user.email, sender, subject, html });
  } catch (error) {
    // No address in the log line (#1435 R16).
    deps.log(
      `existing-account sign-up email failed userId=${user.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
