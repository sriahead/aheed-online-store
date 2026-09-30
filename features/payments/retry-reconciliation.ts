"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getPaymentReconciliationService } from "@/lib/payment-reconciliation-service";

/**
 * Staff's Retry on `/staff/payments`' stopped-retrying list (#945).
 *
 * Re-arms an order the scheduled payment sweep gave up on after a provider
 * failure: it becomes due on the next tick, with a clean failure count. It asks
 * the provider nothing and moves no order itself — the sweep does that, through
 * the same unchanged `confirmPayment`/`failPayment` as the webhook.
 *
 * Re-checks RBAC HERE rather than inheriting it from the page: a server action
 * is a public endpoint at a stable action id (same reasoning as
 * `features/payments/reconcile-refusal.ts`). The repository's `where` is
 * vendor-scoped and limited to provider-failure outcomes on an order still
 * awaiting payment, so a forged or stale order number simply updates nothing.
 *
 * This file may export ONLY async functions (CLAUDE.md, "Server Actions").
 */
export async function retryReconciliation(formData: FormData) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return;

  const orderNumber = formData.get("orderNumber");
  if (typeof orderNumber !== "string" || orderNumber.length === 0) return;

  await getPaymentReconciliationService().rearm(orderNumber);
  revalidatePath("/staff/payments");
}
