/**
 * Form state for the staff order page's payment controls (#1324): "Check payment
 * now" and "Resend confirmation email".
 *
 * Lives here, not in `features/orders/staff-payment-actions.ts`, because a
 * `"use server"` file may export ONLY async functions — a same-file constant used
 * to seed `useActionState` would make every action in it 500 at runtime while
 * build, typecheck and test stay green (CLAUDE.md's Server Actions section).
 */

export interface StaffPaymentFormState {
  /** What happened, in plain words, or `null` before the first submission. */
  message: string | null;
  /** `error` when nothing was done and staff should look elsewhere. */
  tone: "ok" | "error" | null;
}

export const initialStaffPaymentFormState: StaffPaymentFormState = {
  message: null,
  tone: null,
};
