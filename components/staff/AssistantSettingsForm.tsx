"use client";

import { useActionState } from "react";
import { saveAssistantSettings } from "@/features/admin/assistant";
import {
  ASSISTANT_ENABLED_FIELD,
  initialAssistantSettingsState,
} from "@/lib/assistant-settings-form";

/** The `/staff/assistant` on/off switch (#1015). Off by default for every store. */
export function AssistantSettingsForm({ enabled }: { enabled: boolean }) {
  const [state, formAction, pending] = useActionState(
    saveAssistantSettings,
    initialAssistantSettingsState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-start gap-3">
        <input
          id={ASSISTANT_ENABLED_FIELD}
          type="checkbox"
          name={ASSISTANT_ENABLED_FIELD}
          defaultChecked={enabled}
          aria-describedby={`${ASSISTANT_ENABLED_FIELD}-hint`}
          className="mt-1 h-4 w-4"
        />
        <div>
          <label htmlFor={ASSISTANT_ENABLED_FIELD} className="block font-semibold text-primary">
            Show the help assistant
          </label>
          <p id={`${ASSISTANT_ENABLED_FIELD}-hint`} className="text-sm text-primary-muted">
            Adds a help assistant to your storefront&apos;s contact button. Shoppers pick a topic,
            see the answer from your own settings and Help Centre answers, and can message you on
            WhatsApp with a short summary.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-action px-4 py-2 font-semibold text-white hover:bg-action-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.saved && <p className="text-sm text-primary-muted">Saved.</p>}
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
