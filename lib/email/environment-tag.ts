import type { AppEnvironment } from "../config";

/**
 * #1409 — the subject prefix that marks non-production mail. Applied once, inside
 * `getEmailService().send`, so no caller can leave it off, and by `contactMailtoHref` for the
 * footer's mailto links. Idempotent, so a subject that already carries its tag (a retried outbox
 * row, a reply) is not tagged twice.
 */
const TAGS: Record<AppEnvironment, string> = {
  production: "",
  staging: "[STAGING] ",
  development: "[DEV] ",
};

export function withEnvironmentTag(subject: string, environment: AppEnvironment): string {
  const tag = TAGS[environment];
  if (tag === "" || subject.startsWith(tag)) return subject;
  return tag + subject;
}
