"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { remindAbandonedCheckout } from "@/lib/abandoned-checkouts-service";

/**
 * #1554 — "Send reminder". Admin tier only, re-checked here: the page's own gate does not protect a
 * Server Action. The store and the sender come from `requireVendorRole`, never from the form, and
 * every eligibility rule is re-checked by `remindAbandonedCheckout`. Async exports only (CLAUDE.md).
 */
export async function sendReminderAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { error: "Only store admins can send reminders." };

  const orderNumber = formData.get("orderNumber")?.toString().trim() ?? "";
  const discountCodeId = formData.get("discountCodeId")?.toString().trim() || null;
  if (!orderNumber) return { error: "Missing order number." };

  const result = await remindAbandonedCheckout({
    vendorId: auth.vendorId,
    staffUserId: auth.user.id,
    orderNumber,
    discountCodeId,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/staff/abandoned-checkouts");
  return { success: true };
}
