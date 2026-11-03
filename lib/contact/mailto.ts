import { getAppEnvironment } from "@/lib/config";
import { withEnvironmentTag } from "@/lib/email/environment-tag";

/**
 * #1409 R9 — a `mailto:` link whose subject is prefilled and carries the environment tag, so a
 * shopper clicking a store's address on staging or dev cannot send mail that looks like production.
 * The caller checks the address first (`isEmailAddress`); this only builds the href.
 */
export function contactMailtoHref(email: string, subject: string): string {
  const tagged = withEnvironmentTag(subject, getAppEnvironment());
  return `mailto:${email}?subject=${encodeURIComponent(tagged)}`;
}
