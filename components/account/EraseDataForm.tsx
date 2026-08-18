"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { eraseMyData } from "@/features/account/data-rights";
import { initialDataRightsState, type EraseConfirmationMode } from "@/lib/data-rights-form";

/**
 * Art. 17 erasure (P7b, #216).
 *
 * The confirmation field is decided on the server from the account's own
 * providers and passed in: a Google-only account has no password to re-enter,
 * so prompting for one would be an unpassable gate rather than a control.
 *
 * The copy is explicit that orders survive as anonymised records. Telling
 * someone their data is "deleted" and then retaining their order rows — even
 * correctly, for tax law — would be the kind of quiet mismatch between the
 * promise and the behaviour that this whole slice exists to remove.
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

const inputClass =
  "w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";

export interface EraseDataFormProps {
  mode: EraseConfirmationMode;
  accountEmail: string;
  /** Staff/admin accounts can't self-erase — the form renders disabled with the reason. */
  blockedReason: string | null;
}

export function EraseDataForm({ mode, accountEmail, blockedReason }: EraseDataFormProps) {
  const [state, action, working] = useActionState(eraseMyData, initialDataRightsState);

  if (blockedReason) {
    return (
      <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-primary/80">
        {blockedReason}
      </p>
    );
  }

  // Once erased there is nothing left to submit, so the form is replaced by its
  // own outcome rather than re-rendering a button that would now fail.
  if (state.done) {
    return (
      <p
        role="status"
        className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
      >
        {state.done}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div>
        {mode === "password" ? (
          <>
            <label className="mb-1 block text-xs font-medium text-primary/70" htmlFor="password">
              Confirm with your password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className={`${inputClass} ${state.field === "password" ? "border-danger bg-danger-tint" : ""}`}
            />
          </>
        ) : (
          <>
            <label
              className="mb-1 block text-xs font-medium text-primary/70"
              htmlFor="confirmEmail"
            >
              Type <span className="font-semibold">{accountEmail}</span> to confirm
            </label>
            <input
              id="confirmEmail"
              name="confirmEmail"
              type="text"
              autoComplete="off"
              className={`${inputClass} ${state.field === "confirmEmail" ? "border-danger bg-danger-tint" : ""}`}
            />
          </>
        )}
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={working}
        className="flex items-center justify-center gap-2 rounded-2xl bg-danger px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {working ? "Erasing…" : "Erase my data"}
      </button>
    </form>
  );
}
