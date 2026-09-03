"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getBindingRefusalService } from "@/lib/payment-binding-refusals-service";
import { getOrderRecoveryService } from "@/lib/orders-service";
import { getPaymentService, STRIPE_PAYMENT_PROVIDER, type RetrievedSession } from "@/lib/payments";
import { sendOrderConfirmationEmail } from "@/features/checkout/send-confirmation";

/**
 * The two staff actions behind `/staff/payments` (#454).
 *
 * Both re-run the RBAC check HERE rather than inheriting it from the page: a
 * server action is a public endpoint at a stable action id, so a gate on the
 * page is a gate on the page and nothing more (same reasoning as
 * `features/orders/advance-status.ts`).
 *
 * Both also resolve the refusal row through `getBindingRefusalService()`, which
 * scopes by the current vendor. A forged id belonging to another vendor returns
 * null — no read of that row's data, no write — rather than throwing something
 * that would confirm the row exists.
 *
 * Neither action writes `Order.status`. Only `confirmPayment` does, unchanged.
 */

/** Human-readable summary of what the provider said, for the row's audit trail. */
function describe(session: RetrievedSession): string {
  const amount = session.amountTotal === null ? "unknown" : String(session.amountTotal);
  return `session=${session.id} payment_status=${session.paymentStatus ?? "unknown"} status=${session.status ?? "unknown"} amount_total=${amount} currency=${session.currency ?? "unknown"}`;
}

async function resolveTarget(refusalId: FormDataEntryValue | null) {
  if (typeof refusalId !== "string" || refusalId.length === 0) return null;
  return getBindingRefusalService().find(refusalId);
}

/**
 * Asks the provider about the order's OWN STORED session — never the session id
 * the refused event claimed. That distinction is the point: the claimed id is
 * exactly the value under suspicion, and asking about it would confirm nothing
 * about whether this order was actually paid.
 */
export async function reconcileRefusal(formData: FormData) {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return;

  const refusalId = formData.get("refusalId");
  const target = await resolveTarget(refusalId);
  if (!target) return;

  const service = getBindingRefusalService();

  if (!target.storedProviderReference) {
    await service.recordResolution(
      target.id,
      "no-stored-session",
      "This order has no stored provider session, so there is nothing to reconcile against. The payment provider was never successfully asked to create a session for it.",
    );
    revalidatePath("/staff/payments");
    return;
  }

  try {
    const session = await getPaymentService().retrieveSession(target.storedProviderReference);
    const resolution = session.paymentStatus === "paid" ? "provider-paid" : "provider-unpaid";
    await service.recordResolution(target.id, resolution, describe(session));
  } catch (error) {
    // A provider outage must not look like an answer. Recording the failure as a
    // resolution of its own keeps "we asked and could not find out" distinct
    // from "we asked and it was unpaid" — the second authorizes writing the
    // order off, the first does not.
    await service.recordResolution(
      target.id,
      "provider-unreachable",
      `Could not reach the payment provider: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  revalidatePath("/staff/payments");
}

/**
 * Attempts recovery, and is allowed to fail.
 *
 * The binding handed to `confirmPayment` is built ENTIRELY from the provider's
 * own response — not from the refused event, and not from the form. If the
 * provider says the stored session was not paid, this refuses before touching
 * the order at all; if it says it was, `confirmPayment` still has to match the
 * stored `Payment` row in its own `where` clause, so a mismatch is refused by
 * the same mechanism that refused the original webhook.
 */
export async function recoverRefusedOrder(formData: FormData) {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return;

  const refusalId = formData.get("refusalId");
  const target = await resolveTarget(refusalId);
  if (!target || !target.storedProviderReference) return;

  const service = getBindingRefusalService();

  let session: RetrievedSession;
  try {
    session = await getPaymentService().retrieveSession(target.storedProviderReference);
  } catch (error) {
    await service.recordResolution(
      target.id,
      "provider-unreachable",
      `Recovery aborted — could not reach the payment provider: ${error instanceof Error ? error.message : String(error)}`,
    );
    revalidatePath("/staff/payments");
    return;
  }

  if (session.paymentStatus !== "paid") {
    await service.recordResolution(
      target.id,
      "recovery-refused",
      `Recovery refused — the provider does not report this session as paid. ${describe(session)}`,
    );
    revalidatePath("/staff/payments");
    return;
  }

  const orders = getOrderRecoveryService();
  const result = await orders.confirm(target.orderNumber, {
    provider: STRIPE_PAYMENT_PROVIDER,
    providerReference: session.id,
    amountPence: session.amountTotal,
    currency: session.currency,
  });

  if (!result.ok) {
    await service.recordResolution(
      target.id,
      `recovery-refused-${result.reason}`,
      `Recovery refused by the payment binding (${result.reason}) even though the provider reports the session paid. ${describe(session)}`,
    );
    revalidatePath("/staff/payments");
    return;
  }

  // Same order as the webhook route: email only once the transition actually
  // committed, so a second click cannot email the shopper twice — the second
  // call refuses with `already-processed` and never reaches here.
  const order = await orders.findOrder(target.orderNumber);
  if (order) await sendOrderConfirmationEmail(order);

  await service.recordResolution(
    target.id,
    "recovered",
    `Order confirmed from the provider's own record. ${describe(session)}`,
  );
  revalidatePath("/staff/payments");
  revalidatePath("/staff/orders");
}
