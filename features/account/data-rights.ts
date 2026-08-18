"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { getDataRightsRepository } from "@/lib/repositories/data-rights";
import {
  checkEmailConfirmation,
  eraseConfirmationMode,
  erasureSummary,
  parseDisplayName,
  type DataRightsFormState,
} from "@/lib/data-rights-form";

/**
 * Account data-rights actions (P7b, #216) — the write half of /account/data.
 *
 * Each action resolves the session ITSELF rather than trusting the page that
 * rendered the form. A server action is a public endpoint at a stable id:
 * anyone who has loaded the page once can POST to it forever, so the page's
 * check protects the page, not this. Same posture as P6b1's catalogue actions
 * and P4b's advance-status.
 *
 * The vendor comes from the request host inside the repository, never from a
 * submitted field — nothing in these forms can redirect a write at another
 * vendor's rows.
 *
 * Every field rule lives in lib/data-rights-form.ts, which knows nothing about
 * FormData, Prisma or sessions. This file is the wiring, and holds no rules of
 * its own.
 *
 * EVERY EXPORT HERE IS AN ASYNC FUNCTION. The form state constants live in
 * lib/data-rights-form.ts because a same-file value export makes every action
 * in a "use server" file 500 at runtime, while build, typecheck and test all
 * stay green (#159).
 */

async function currentUser() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const user = session?.user as { id: string; email: string } | undefined;
  return user ?? null;
}

const SIGNED_OUT: DataRightsFormState = {
  error: "You need to be signed in to do that.",
  field: null,
  done: null,
};

export async function updateMyName(
  _prev: DataRightsFormState,
  formData: FormData,
): Promise<DataRightsFormState> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  const parsed = parseDisplayName(formData.get("name") as string | null);
  if (!parsed.ok) return parsed.state;

  const repo = await getDataRightsRepository();
  await repo.updateDisplayName(user.id, parsed.value);

  // The account page renders the name from the session, which Better Auth
  // re-reads from the User row per request — so revalidating is enough and no
  // session refresh is needed.
  revalidatePath("/account");
  revalidatePath("/account/data");
  return { error: null, field: null, done: "Your name has been updated." };
}

/**
 * Erase this user's personal data at the current vendor.
 *
 * Irreversible, so it is gated twice: an authenticated session, and a
 * confirmation the account can actually satisfy — the current password for a
 * credential account, or the account's own email typed exactly for an
 * OAuth-only one (a Google account has no password to re-enter).
 *
 * There is deliberately NO emailed confirmation link. #104 (Resend has no
 * verified sending domain) means mail is not reliably deliverable in
 * production, and gating a destructive action on a channel that may silently
 * drop would make it both unusable and unvalidatable.
 */
export async function eraseMyData(
  _prev: DataRightsFormState,
  formData: FormData,
): Promise<DataRightsFormState> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;

  const repo = await getDataRightsRepository();

  // A vendor ADMIN erasing themselves would walk straight through P6.7's
  // self-lockout guards from an angle they don't cover, and could leave a
  // vendor with zero admins. Refuse, and say what to do about it.
  if (await repo.hasVendorMembership(user.id)) {
    return {
      error:
        "Staff and admin accounts can't be erased from here — ask another admin to remove your role first.",
      field: null,
      done: null,
    };
  }

  const mode = eraseConfirmationMode(await repo.getAccountProviders(user.id));

  if (mode === "email") {
    const confirmed = checkEmailConfirmation(
      formData.get("confirmEmail") as string | null,
      user.email,
    );
    if (!confirmed.ok) return confirmed.state;
  } else {
    const password = formData.get("password");
    if (typeof password !== "string" || password === "") {
      return { error: "Enter your password to confirm.", field: "password", done: null };
    }
    // Better Auth exposes no bare "check this password" call, so the sign-in
    // endpoint is used as the verifier. `asResponse` is left off so no session
    // cookie is set on this response — the caller is already signed in, and a
    // confirmation step has no business rotating their session.
    try {
      await (await getAuth()).api.signInEmail({ body: { email: user.email, password } });
    } catch {
      return { error: "That password isn't right.", field: "password", done: null };
    }
  }

  const result = await repo.eraseForCurrentVendor(user.id);

  revalidatePath("/account");
  revalidatePath("/account/data");
  return {
    error: null,
    field: null,
    done: erasureSummary(result.identityDeleted, result.ordersAnonymised),
  };
}
