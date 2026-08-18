/**
 * Data-rights field rules (P7b, #216) — pure, DB-free, unit-testable.
 *
 * Same posture as lib/catalogue-form.ts (P6b1) and lib/shopping-list.ts (P3d):
 * every decision about what a submitted field MEANS lives where a test can
 * reach it without a database, a session or a request. The server actions in
 * features/account/data-rights.ts do the FormData reading and the repository
 * calls; nothing here knows either exists.
 *
 * The state shapes are declared here rather than beside the actions because
 * features/account/data-rights.ts is `"use server"` — every export of such a
 * file must be an async function, and a same-file value export makes EVERY
 * action in the file 500 at runtime while build, typecheck and test all stay
 * green (#159). A plain state constant has no business there regardless.
 *
 * The error/field/saved shape deliberately mirrors CatalogueFormState rather
 * than importing it: a three-field state object is not worth coupling an
 * account-settings module to the catalogue admin's.
 */

export interface DataRightsFormState {
  error: string | null;
  /** The control to point at, matching the input's `name`. Null for whole-form errors. */
  field: string | null;
  /** Human-readable confirmation of what happened, rendered on success. */
  done: string | null;
}

export const initialDataRightsState: DataRightsFormState = {
  error: null,
  field: null,
  done: null,
};

/**
 * Which confirmation an account can actually satisfy.
 *
 * A Google-only account has no password to re-enter (`Account.password` is null
 * for the OAuth provider), so a password prompt would be an unpassable gate
 * rather than a security control. Better Auth writes `"credential"` as the
 * providerId for email/password accounts.
 */
export type EraseConfirmationMode = "password" | "email";

export function eraseConfirmationMode(providerIds: readonly string[]): EraseConfirmationMode {
  return providerIds.includes("credential") ? "password" : "email";
}

export type ParsedName = { ok: true; value: string } | { ok: false; state: DataRightsFormState };

/**
 * A display name must have something in it. Whitespace-only is the case worth
 * naming explicitly — it renders as a blank account page and reads as a bug
 * rather than as the empty string someone actually submitted.
 */
export function parseDisplayName(raw: string | null): ParsedName {
  const value = (raw ?? "").trim();
  if (value === "") {
    return {
      ok: false,
      state: { error: "Your name can't be blank.", field: "name", done: null },
    };
  }
  return { ok: true, value };
}

export type ParsedConfirmation = { ok: true } | { ok: false; state: DataRightsFormState };

/**
 * Check the erasure confirmation for an OAuth-only account: the account's own
 * email address, typed exactly.
 *
 * Compared case-sensitively and without trimming beyond the outer whitespace a
 * browser or a paste tends to add. The point of this control is deliberate
 * friction on an irreversible action, so "close enough" is not the standard.
 */
export function checkEmailConfirmation(
  submitted: string | null,
  accountEmail: string,
): ParsedConfirmation {
  if ((submitted ?? "").trim() !== accountEmail) {
    return {
      ok: false,
      state: {
        error: "That doesn't match your account email address. Type it exactly to confirm.",
        field: "confirmEmail",
        done: null,
      },
    };
  }
  return { ok: true };
}

/** What the user is told after a successful erasure — differs by whether the login survived. */
export function erasureSummary(identityDeleted: boolean, ordersAnonymised: number): string {
  const orders =
    ordersAnonymised === 1
      ? "1 order was kept as an anonymised financial record"
      : `${ordersAnonymised} orders were kept as anonymised financial records`;
  return identityDeleted
    ? `Your data has been erased and your sign-in has been deleted. ${orders}, with your name and address removed.`
    : `Your data at this store has been erased. ${orders}, with your name and address removed. Your sign-in still works at the other store you shop with.`;
}
