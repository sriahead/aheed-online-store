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

  await setAiDailyBudgetForVendor(auth.vendorId, parsed.value);
  revalidatePath("/staff/ai-usage");
  return { error: null, saved: true };
}
