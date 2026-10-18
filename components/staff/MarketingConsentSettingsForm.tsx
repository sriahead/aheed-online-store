"use client";

import { useActionState } from "react";
import { saveMarketingConsentSettings } from "@/features/admin/marketing-consent";
import {
  MARKETING_CONSENT_ENABLED_FIELD,
  initialMarketingConsentSettingsState,
} from "@/lib/marketing-consent-settings-form";

/** The `/staff/storefront` marketing-consent switch (#1134). Off by default for every store. */
export function MarketingConsentSettingsForm({ enabled }: { enabled: boolean }) {
  const [state, formAction, pending] = useActionState(
    saveMarketingConsentSettings,
    initialMarketingConsentSettingsState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-start gap-3">
        <input
          id={MARKETING_CONSENT_ENABLED_FIELD}
          type="checkbox"
          name={MARKETING_CONSENT_ENABLED_FIELD}
          defaultChecked={enabled}
          aria-describedby={`${MARKETING_CONSENT_ENABLED_FIELD}-hint`}
          className="mt-1 h-4 w-4"
        />
        <div>
          <label
            htmlFor={MARKETING_CONSENT_ENABLED_FIELD}
            className="block font-semibold text-primary"
          >
            Ask shoppers for marketing consent
          </label>
          <p id={`${MARKETING_CONSENT_ENABLED_FIELD}-hint`} className="text-sm text-primary-muted">
            Adds an unticked opt-in for marketing emails to account sign-up and to each
            shopper&apos;s &quot;Your data&quot; page, and adds the matching wording to your privacy
            policy. Each choice is recorded with the exact wording shown. Nothing sends marketing
            emails yet — this only collects consent. Have the wording reviewed before you switch it
            on.
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
