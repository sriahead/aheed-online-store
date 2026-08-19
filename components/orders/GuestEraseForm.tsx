"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { eraseGuestOrder } from "@/features/orders/guest-data-rights";
import { GUEST_ERASE_CONFIRMATION, initialDataRightsState } from "@/lib/data-rights-form";

/**
 * Guest Art. 17 erasure (P7 closeout, #251 / #222).
 *
 * Rendered only under a successful lookup, so the pair has already been proven
 * once for display — but the action re-proves it, because this component's
 * hidden fields are attacker-controlled like any other form input.
 *
 * The copy states the one-order scope up front rather than in the confirmation
 * afterwards. A guest with several orders needs to know that before they decide
 * this is done, not after.
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

export interface GuestEraseFormProps {
  orderNumber: string;
  email: string;
}

export function GuestEraseForm({ orderNumber, email }: GuestEraseFormProps) {
  const [state, action, working] = useActionState(eraseGuestOrder, initialDataRightsState);

  // Once erased there is nothing left to submit, so the form is replaced by its
  // own outcome rather than re-rendering a button that would now fail.
  if (state.done) {
    return (
      <p
        role="status"
        className="rounded-xl bg-action-tint px-4 py-3 text-xs font-medium text-primary"
      >
        {state.done}
      </p>
    );
  }

  return (
    <details className="rounded-2xl border border-black/10 bg-surface-muted p-4">
      <summary className="cursor-pointer text-xs font-bold text-primary">
        Erase the personal details on this order
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs leading-relaxed text-primary/80">
          This removes the delivery name, address and phone number from{" "}
          <strong>this one order</strong> and unlinks your email. The order itself is kept as an
          anonymised financial record, which the law requires. It cannot be undone, and it does not
          affect any other order you placed as a guest.
        </p>

        <form action={action} className="space-y-3">
          <input type="hidden" name="orderNumber" value={orderNumber} />
          <input type="hidden" name="email" value={email} />

          <div>
            <label htmlFor="confirmErase" className="mb-1 block text-xs font-bold text-primary">
              Type {GUEST_ERASE_CONFIRMATION} to confirm
            </label>
            <input
              type="text"
              id="confirmErase"
              name="confirmErase"
              autoComplete="off"
              required
              aria-describedby={state.error ? "guest-erase-error" : undefined}
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {state.error && (
            <p id="guest-erase-error" role="alert" className="text-xs font-medium text-danger">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={working}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            <span>{working ? "Erasing…" : "Erase my details"}</span>
          </button>
        </form>
      </div>
    </details>
  );
}
