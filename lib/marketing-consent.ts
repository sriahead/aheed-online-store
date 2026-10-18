/**
 * Marketing consent rules (#1134) — pure, DB-free, unit-testable. The database half lives in
 * `lib/repositories/marketing-consent.ts`; the request-scoped facade in
 * `lib/marketing-consent-service.ts`.
 *
 * Consent here is the UK PECR / UK GDPR kind: separate, unticked, specific and recorded with the
 * exact wording shown. It is NOT the #1107 cookie choice, which is per device and attributable to
 * no one. The statement names email only, because consent to email is not consent to SMS.
 */

/**
 * The exact sentence a shopper agrees to. Built from the vendor's own name (ADR-004), never a
 * literal, and rebuilt server-side wherever a choice is recorded, so the stored statement is what
 * the store actually showed, not what a client sent.
 */
export function marketingConsentStatement(vendorName: string): string {
  return `Email me marketing and promotional offers from ${vendorName}. You can change this at any time in your account.`;
}

/** The sign-up body field the register form sets when its checkbox is ticked. */
export const MARKETING_OPT_IN_FIELD = "marketingOptIn";

/** Better Auth's email-and-password sign-up endpoint path, as its endpoint context reports it. */
export const SIGN_UP_EMAIL_PATH = "/sign-up/email";

export interface SignUpConsentVendor {
  id: string;
  name: string;
  marketingConsentEnabled: boolean;
}

export type SignUpConsentDecision =
  | { record: true; vendorId: string; statement: string }
  | {
      record: false;
      reason: "not-email-sign-up" | "not-opted-in" | "no-vendor" | "switch-off";
    };

/**
 * Whether a just-created user's sign-up carries a marketing opt-in this store should record.
 * All four must hold: the request is the email sign-up (a Google sign-up has no checkbox), the
 * body's flag is the boolean `true` (not the string "true"), a vendor resolved from the host, and
 * that vendor's switch is on — re-checked here, because the endpoint is public and a crafted
 * request could carry the flag for a store that never asked. Any statement text in the body is
 * ignored; the statement comes from the vendor's name.
 */
export function decideSignUpMarketingConsent(input: {
  path: string | undefined;
  body: unknown;
  vendor: SignUpConsentVendor | null;
}): SignUpConsentDecision {
  if (input.path !== SIGN_UP_EMAIL_PATH) return { record: false, reason: "not-email-sign-up" };
  const body = input.body;
  const optedIn =
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>)[MARKETING_OPT_IN_FIELD] === true;
  if (!optedIn) return { record: false, reason: "not-opted-in" };
  if (!input.vendor) return { record: false, reason: "no-vendor" };
  if (!input.vendor.marketingConsentEnabled) return { record: false, reason: "switch-off" };
  return {
    record: true,
    vendorId: input.vendor.id,
    statement: marketingConsentStatement(input.vendor.name),
  };
}
