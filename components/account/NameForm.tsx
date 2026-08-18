"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { updateMyName } from "@/features/account/data-rights";
import { initialDataRightsState } from "@/lib/data-rights-form";

/**
 * Art. 16 rectification (P7b, #216) — correct your own display name.
 *
 * Deliberately name-only. There is no saved-address book to correct (Address is
 * a per-order snapshot by design), and changing the account email needs
 * verification against the new address, which needs working email delivery
 * (#221, blocked on #104).
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

const inputClass =
  "w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";

export function NameForm({ currentName }: { currentName: string }) {
  const [state, action, saving] = useActionState(updateMyName, initialDataRightsState);

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-primary/70" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={currentName}
          className={`${inputClass} ${state.field === "name" ? "border-danger bg-danger-tint" : ""}`}
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
        >
          {state.error}
        </p>
      )}
      {state.done && !state.error && (
        <p
          role="status"
          className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
        >
          {state.done}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Save className="h-4 w-4" aria-hidden />
        {saving ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}
