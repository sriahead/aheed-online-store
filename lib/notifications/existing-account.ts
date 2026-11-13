import type { EmailBrand } from "@/lib/email/layout/brand";
import { fallbackBrand } from "@/lib/email/layout/fallback";
import {
  finish,
  orNull,
  templateCopy,
  type CopyOverrides,
  type RenderedEmail,
} from "@/lib/email/templates/compose";
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
  /** #1564 — the store's look; neutral when absent. */
  brand?: EmailBrand;
  overrides?: CopyOverrides | null;
}): RenderedEmail {
  const base = input.baseUrl.replace(/\/+$/, "");
  const brand = input.brand ?? fallbackBrand(input.storeName, base);
  const hasPassword = input.providers.includes(PASSWORD_PROVIDER);
  const hasGoogle = input.providers.includes(GOOGLE_PROVIDER);
  // Neither recorded is unexpected; offer the password route so the holder is never stuck.
  const offerReset = hasPassword || !hasGoogle;
  const { copy, reason } = templateCopy(
    "auth.existing_account",
    { storeName: input.storeName },
    input.overrides,
  );

  return finish(
    copy.subject,
    {
      preheader: copy.preheader,
      heading: copy.heading,
      intro: orNull(copy.intro),
      blocks: hasGoogle
        ? [
            {
              kind: "paragraph",
              text: "You can also sign in with Google using this email address.",
            },
          ]
        : [],
      cta: { label: copy.ctaLabel || "Sign in to your account", href: `${base}/login` },
      links: offerReset
        ? [{ label: "Forgotten your password? Reset it", href: `${base}/forgot-password` }]
        : [],
      reassurance: orNull(copy.reassurance),
      signOff: orNull(copy.signOff),
      reason,
    },
    brand,
  );
}

export interface ExistingAccountDeps {
  loadProviders(userId: string): Promise<readonly string[]>;
  resolveSender(): Promise<EmailSender | undefined>;
  defaultStoreName: string;
  /** #1564 — the store's email look for this request; neutral when absent or failing. */
  resolveBrand?(storeName: string, baseUrl: string): Promise<EmailBrand>;
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
    const storeName = sender?.name ?? deps.defaultStoreName;
    const brand = deps.resolveBrand
      ? await deps.resolveBrand(storeName, baseUrl).catch(() => undefined)
      : undefined;
    const { subject, html, text } = existingAccountEmail({ storeName, baseUrl, providers, brand });
    await deps.send({ to: user.email, sender, subject, html, text });
  } catch (error) {
    // No address in the log line (#1435 R16).
    deps.log(
      `existing-account sign-up email failed userId=${user.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
