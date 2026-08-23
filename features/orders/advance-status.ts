"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/orders-service";
import { sendOrderStatusEmail } from "./send-status-email";

/**
 * Advance one order along the staff ladder (P4b, #125).
 *
 * The RBAC check is re-run HERE, not inherited from the page that rendered the
 * form. A server action is a public endpoint: Next exposes it at a stable action
 * id that anyone holding the rendered HTML can POST to, so a gate on the page is
 * a gate on the page and nothing more.
 *
 * `orderNumber` and `toStatus` arrive as untrusted form fields. Neither is
 * trusted: the repository re-reads the order, checks `toStatus` is a real status
 * and a legal successor of the PERSISTED status, and scopes by vendor — so a
 * forged payload fails exactly the way a stale one does.
 *
 * The email is sent after the transition commits, and never throws.
 */
export async function advanceStatus(formData: FormData) {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return;

  const orderNumber = formData.get("orderNumber");
  const toStatus = formData.get("toStatus");
  if (typeof orderNumber !== "string" || typeof toStatus !== "string") return;

  // The repository resolves the vendor from the request host, which is the same
  // vendor requireVendorRole just authorized against — so the gate above and the
  // scoping below cannot disagree.
  const result = await getOrderRepository().advance(orderNumber, toStatus, {
    userId: auth.user.id,
  });

  if (!result.ok) return;

  await sendOrderStatusEmail(result.order, toStatus);
  revalidatePath("/staff/orders");
}
