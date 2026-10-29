"use client";

import { useActionState } from "react";
import { checkPaymentNow, resendConfirmationEmail } from "@/features/orders/staff-payment-actions";
import { initialStaffPaymentFormState, type StaffPaymentFormState } from "@/lib/staff-payment-form";

/**
 * The staff order page's payment controls (#1324). The page decides which to
 * render (`paymentControlsFor`); each action re-checks the role on the server.
 */

function Result({ state }: { state: StaffPaymentFormState }) {
  if (!state.message) return null;
  return state.tone === "error" ? (
    <p
      role="alert"
      className="mt-3 rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
    >
      {state.message}
    </p>
  ) : (
    <p
      role="status"
      className="mt-3 rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
    >
      {state.message}
    </p>
  );
}

const BUTTON =
  "rounded-full border border-action px-4 py-2 text-sm font-medium text-action hover:bg-action hover:text-white disabled:opacity-60";

export function CheckPaymentControl({ orderNumber }: { orderNumber: string }) {
  const [state, action, pending] = useActionState(checkPaymentNow, initialStaffPaymentFormState);
  return (
    <form action={action} className="mb-6 rounded-2xl border border-line p-4">
      <h2 className="text-sm font-bold text-primary">Payment not confirmed yet</h2>
      <p className="mt-1 text-xs leading-relaxed text-primary-muted">
        Asks the payment provider about this order now. If it was paid, the order is confirmed and
        the customer is emailed. Nothing is cancelled or refunded.
      </p>
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <button type="submit" disabled={pending} className={`mt-3 ${BUTTON}`}>
        {pending ? "Checking…" : "Check payment now"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function ResendConfirmationControl({ orderNumber }: { orderNumber: string }) {
  const [state, action, pending] = useActionState(
    resendConfirmationEmail,
    initialStaffPaymentFormState,
  );
  return (
    <form action={action} className="mb-6 rounded-2xl border border-line p-4">
      <h2 className="text-sm font-bold text-primary">Confirmation email</h2>
      <p className="mt-1 text-xs leading-relaxed text-primary-muted">
        Sends the order confirmation email to the customer again, for example when they say it never
        arrived.
      </p>
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <button type="submit" disabled={pending} className={`mt-3 ${BUTTON}`}>
        {pending ? "Sending…" : "Resend confirmation email"}
      </button>
      <Result state={state} />
    </form>
  );
}
