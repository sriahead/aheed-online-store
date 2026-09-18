"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderCancelService, getOrderRepository } from "@/lib/orders-service";
import { canCancel } from "@/lib/order-status";
import { sendOrderStatusEmail } from "./send-status-email";

/**
 * Staff cancellation of a paid order (P9.2, #696).
 *
 * THIS FILE MAY EXPORT ONLY ASYNC FUNCTIONS. Not a constant, not a type, not a
 * re-export — the rule is enforced at runtime, so `build`, `typecheck` and
 * `test` all stay green while every action in the file 500s for every caller.
 *
 * `ADMIN`, not `STAFF, ADMIN` like `advanceStatus`. That ladder is forward-only
 * and every rung is recoverable by moving on; this is terminal, irreversible
 * from the UI, and moves a loyalty balance and a discount code's remaining uses.
 * It reads as the platform-settings side of #737's STAFF/ADMIN split rather than
 * day-to-day operations.
 *
 * The RBAC check is re-run HERE and not inherited from the page that rendered
 * the form, for the same reason `advanceStatus` re-runs it: a server action is a
 * public endpoint at a stable action id, so a gate on the page is a gate on the
 * page and nothing more.
 *
 * `orderNumber` and `reason` arrive as untrusted form fields. The order is
 * re-read and `canCancel` is applied to the PERSISTED status, so a stale form
 * (the order moved on in another tab) and a forged one fail the same way. The
 * repository's guarded `updateMany` then re-checks the same rule at the query
 * level, which is what actually makes it race-safe — this check is here to fail
 * early and quietly, not because it is the authority.
 */
export async function cancelOrderStaff(formData: FormData) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return;

  const orderNumber = formData.get("orderNumber");
  const reason = formData.get("reason");
  if (typeof orderNumber !== "string" || typeof reason !== "string") return;

  // A reason is required by the form and re-required here: it becomes the
  // OrderStatusEvent's note, which is the only durable record of WHY an order
  // staff cancelled was cancelled.
  const trimmed = reason.trim();
  if (trimmed.length === 0) return;

  const order = await getOrderRepository().getForStaff(orderNumber);
  if (!order || !canCancel(order.status)) return;

  // Returns the re-read order on success, null when nothing was cancelled.
  const cancelled = await getOrderCancelService().cancelConfirmed(
    orderNumber,
    trimmed,
    auth.user.id,
  );
  if (!cancelled) return;

  // After the transaction commits, never inside it — an HTTP call inside a
  // Prisma transaction holds a Postgres transaction open against a 5s timeout
  // (the defect P3c had to fix in createPayment). Never throws, like every other
  // caller of this function.
  await sendOrderStatusEmail(cancelled, "CANCELLED");

  revalidatePath("/staff/orders");
  revalidatePath(`/staff/orders/${orderNumber}`);
}
