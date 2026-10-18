import {
  decideSignUpMarketingConsent,
  SIGN_UP_EMAIL_PATH,
  type SignUpConsentVendor,
} from "@/lib/marketing-consent";
import type { RecordErrorEventInput } from "@/lib/repositories/error-events";

/**
 * The body of Better Auth's `databaseHooks.user.create.after` for marketing consent (#1134).
 *
 * Better Auth 1.6 hands that hook the endpoint context, body included, and its sign-up schema
 * accepts extra keys while `parseUserInput` ignores unknown ones — so the register form's
 * `marketingOptIn` reaches here without becoming a `User` column. A sign-up for an email that
 * already exists creates no user, so this never runs for someone else's account.
 *
 * Dependencies are injected so the decision, the write and the failure path are unit-testable
 * without Better Auth or a database. Never throws: a failed consent write must not fail the
 * sign-up — the shopper can opt in from their account, and the failure is recorded as an
 * ErrorEvent.
 */
export interface SignUpConsentDeps {
  resolveVendor: () => Promise<SignUpConsentVendor | null>;
  record: (vendorId: string, userId: string, statement: string) => Promise<void>;
  reportError: (input: RecordErrorEventInput) => Promise<void>;
}

export async function recordSignUpMarketingConsent(
  userId: string,
  context: { path?: string; body?: unknown } | null | undefined,
  deps: SignUpConsentDeps,
): Promise<void> {
  try {
    // Cheap checks first: most user creations (Google, no tick) never need the vendor read.
    const early = decideSignUpMarketingConsent({
      path: context?.path,
      body: context?.body,
      vendor: { id: "", name: "", marketingConsentEnabled: true },
    });
    if (!early.record) return;

    const decision = decideSignUpMarketingConsent({
      path: context?.path,
      body: context?.body,
      vendor: await deps.resolveVendor(),
    });
    if (!decision.record) return;
    await deps.record(decision.vendorId, userId, decision.statement);
  } catch (error) {
    try {
      await deps.reportError({
        message: `Marketing consent not recorded at sign-up: ${
          error instanceof Error ? error.message : String(error)
        }`,
        stack: error instanceof Error ? (error.stack ?? null) : null,
        digest: null,
        path: `/api/auth${SIGN_UP_EMAIL_PATH}`,
        method: "POST",
        routerKind: "App Router",
        routeType: "route",
      });
    } catch (reportFailure) {
      console.error("Failed to persist marketing-consent ErrorEvent:", reportFailure);
    }
  }
}
