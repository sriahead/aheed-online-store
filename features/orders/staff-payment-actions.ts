"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getPaymentCheckService, type PaymentCheckResult } from "@/lib/payment-check-service";
import type { StaffPaymentFormState } from "@/lib/staff-payment-form";

/**
 * The staff order page's two payment controls (#1324).
 *
 * Both are store-admin only, like Retry and Recover on `/staff/payments`, and
 * both re-check `requireVendorRole("ADMIN")` here as their first step: a server
 * action is a public endpoint at a stable id, so the page hiding a control
 * protects nothing on its own.
 *
 * "Check payment now" runs the same single-order check as the shopper's return
 * page (`lib/payment-check.ts`): it can confirm a paid order and can never
 * release or cancel one. "Resend confirmation email" re-sends only for a paid
 * order.
 *
 * NOTE: this file may export async functions and nothing else (CLAUDE.md's
 * Server Actions section). Form state lives in `lib/staff-payment-form.ts`.
 */

function refusal(status: number): StaffPaymentFormState {
  return {
    message:
      status === 401
        ? "Please sign in as a store admin to do this."
        : "Only a store admin can check payments or resend confirmation emails.",
    tone: "error",
  };
}

function orderNumberFrom(formData: FormData): string {
  return String(formData.get("orderNumber") ?? "");
}

/** One distinct message per outcome — staff act on the difference. */
function describeCheck(result: PaymentCheckResult): StaffPaymentFormState {
  switch (result.kind) {
    case "not-found":
      return { message: "This order could not be found for this store.", tone: "error" };
    case "not-pending":
      return {
        message: "This order is no longer awaiting payment, so there is nothing to check.",
        tone: "ok",
      };
    case "no-session":
      return {
        message:
          "No payment was ever started for this order, so there is nothing to ask the payment provider about. The scheduled check releases it after seven days.",
        tone: "error",
      };
    case "provider-error":
      return {
        message:
          "Could not reach the payment provider. Nothing was changed — try again in a few minutes.",
        tone: "error",
      };
    case "not-paid":
      return {
        message: `The payment provider does not report this order as paid (session ${result.sessionStatus ?? "unknown"}, payment ${result.paymentStatus ?? "unknown"}). Nothing was changed.`,
        tone: "error",
      };
    case "confirmed":
      return {
        message:
          "Payment confirmed. The order is now confirmed and a confirmation email was sent to the customer.",
        tone: "ok",
      };
    case "refused":
      return {
        message: `The payment provider reports this order as paid, but the payment record did not match (${result.reason}), so it was not confirmed. It now appears on Payment Issues.`,
        tone: "error",
      };
  }
}

export async function checkPaymentNow(
  _prev: StaffPaymentFormState,
  formData: FormData,
): Promise<StaffPaymentFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const orderNumber = orderNumberFrom(formData);
  const result = await getPaymentCheckService().check(orderNumber);
  if (result.kind === "confirmed") {
    revalidatePath(`/staff/orders/${orderNumber}`);
    revalidatePath("/staff/orders");
  }
  return describeCheck(result);
}

export async function resendConfirmationEmail(
  _prev: StaffPaymentFormState,
  formData: FormData,
): Promise<StaffPaymentFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const result = await getPaymentCheckService().resendConfirmation(orderNumberFrom(formData));
  switch (result.kind) {
    case "not-found":
      return { message: "This order could not be found for this store.", tone: "error" };
    case "not-paid":
      return {
        message: "This order has not been paid, so no confirmation email was sent.",
        tone: "error",
      };
    case "sent":
      return {
        message:
          "Confirmation email sent to the customer's address. If it still does not arrive, check the address on the order.",
        tone: "ok",
      };
  }
}
