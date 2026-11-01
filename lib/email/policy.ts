import type { EmailSender } from "./types";

/**
 * The two pure decisions behind every outgoing email (#1217). Pure so the Client Setup dashboard
 * can show a vendor exactly which From address its mail goes out with, by calling the same
 * function the sender calls rather than re-deriving it.
 */

/** Splits a comma-separated config value into lower-cased, trimmed, non-empty entries. */
export function parseEmailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function emailDomain(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1
    ? ""
    : address
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

export interface ResolvedSender {
  from: EmailSender;
  replyTo?: string;
}

/**
 * R5. A vendor sends from its own address once its domain is onboarded (listed in
 * EMAIL_VERIFIED_DOMAINS). Until then it sends from the platform address with Reply-To set to the
 * vendor, so replies still reach the store. No sender means the platform itself.
 */
export function resolveSender(input: {
  sender?: EmailSender;
  verifiedDomains: string | undefined;
  platformFrom: string;
  platformName: string;
}): ResolvedSender {
  const { sender, platformFrom, platformName } = input;
  if (!sender) return { from: { name: platformName, email: platformFrom } };

  const verified = parseEmailList(input.verifiedDomains);
  if (sender.email && verified.includes(emailDomain(sender.email))) {
    return { from: { name: sender.name, email: sender.email } };
  }
  return {
    from: { name: sender.name, email: platformFrom },
    ...(sender.email ? { replyTo: sender.email } : {}),
  };
}

/**
 * R6. `open` allows every recipient. Anything else — including unset — is allowlist mode: only
 * addresses in EMAIL_ALLOWED_RECIPIENTS. An empty allowlist therefore sends nothing.
 */
export function isRecipientAllowed(input: {
  to: string;
  mode: string | undefined;
  allowedRecipients: string | undefined;
}): boolean {
  if ((input.mode ?? "").trim().toLowerCase() === "open") return true;
  return parseEmailList(input.allowedRecipients).includes(input.to.trim().toLowerCase());
}
