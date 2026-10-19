"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { parseAiBudget, type AiBudgetFormState } from "@/lib/ai-budget-form";
import { setAiDailyBudgetForVendor } from "@/lib/ai-usage-service";

/**
 * #1029 — set the current vendor's daily Workers AI budget from `/staff/ai-usage`.
 *
 * PLATFORM ADMINS ONLY, checked HERE. The budget caps the platform's shared spend, not the vendor's
 * own, so a store admin — who passes `requireVendorRole("ADMIN")` and can open the page — must not be
 * able to raise it. The page hides the form from store admins, but hiding a form is not the control:
 * a server action is a public endpoint any signed-in session can post to.
 *
 * Writes only `auth.vendorId` (the host's vendor), never an id from the form. Exports only async
 * functions (CLAUDE.md); the state type and parser are in lib/ai-budget-form.ts.
 */
export async function saveAiBudget(
  _prev: AiBudgetFormState,
  form: FormData,
): Promise<AiBudgetFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok || auth.via !== "platform-admin") {
    return { error: "Only a platform admin can change a store's AI budget.", saved: false };
  }

  const parsed = parseAiBudget(form.get("aiDailyNeuronBudget"));
  if (!parsed.ok) return { error: parsed.error, saved: false };

  // #1161 — a store with no settings record has nothing to write the budget to; say so rather than
  // throwing to an error page. Creating the record is provisioning, not this form's job.
  const written = await setAiDailyBudgetForVendor(auth.vendorId, parsed.value);
  if (!written) {
    return {
      error: "This store has no settings record yet, so its AI budget cannot be saved.",
      saved: false,
    };
  }
  revalidatePath("/staff/ai-usage");
  return { error: null, saved: true };
}
