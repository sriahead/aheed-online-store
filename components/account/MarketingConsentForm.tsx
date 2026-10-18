"use client";

import { useActionState } from "react";
import { setMyMarketingConsent } from "@/features/account/data-rights";
import { initialDataRightsState } from "@/lib/data-rights-form";

/**
 * Marketing emails (#1134) — the account half of marketing consent, on /account/data.
 *
 * One button: "Opt in" (showing the exact statement being agreed to) when the shopper is not
 * opted in, "Withdraw" when they are. The page decides whether the section renders at all;
 * withdrawal stays offered while `granted` even if the store has since switched the feature off.
 * The statement comes from the page, built from the store's own name — never a literal here.
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */
export function MarketingConsentForm({
  granted,
  statement,
}: {
  granted: boolean;
  statement: string;
}) {
  const [state, action, saving] = useActionState(setMyMarketingConsent, initialDataRightsState);

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-primary" role="status" aria-live="polite">
        {granted
          ? "You are opted in to marketing emails from this store."
          : "You are not opted in to marketing emails from this store."}
      </p>
      {!granted && <p className="text-sm text-primary-muted">{statement}</p>}
      <input type="hidden" name="granted" value={granted ? "false" : "true"} />

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
        disabled={saving}
        className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {granted ? "Withdraw" : "Opt in"}
      </button>
    </form>
  );
}
