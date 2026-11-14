"use client";

import { useActionState, useState } from "react";
import { savePlatformBrandingAction } from "@/app/(admin)/staff/platform/client-setup/actions";
import {
  initialClientSetupFormState,
  type ClientSetupFormState,
} from "@/lib/client-setup/form-state";
import { buttonClass, inputClass, labelClass } from "@/lib/form-classes";

export function BrandingFormMessage({ state }: { state: ClientSetupFormState }) {
  if (!state.message) return null;
  return state.ok ? (
    <p
      role="status"
      className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
    >
      {state.message}
    </p>
  ) : (
    <p role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
      {state.message}
    </p>
  );
}

export function PlatformBrandingForm({
  vendorId,
  currentTerminology,
  customTerminology,
  defaultTerminology,
}: {
  vendorId: string;
  currentTerminology: string;
  customTerminology: string | null;
  defaultTerminology: string;
}) {
  const [state, action, saving] = useActionState(
    savePlatformBrandingAction,
    initialClientSetupFormState,
  );
  const [terminology, setTerminology] = useState(customTerminology ?? "");
  const [applyToAll, setApplyToAll] = useState(false);

  return (
    <form action={action} className="space-y-4" data-platform-branding-form>
      <input type="hidden" name="vendorId" value={vendorId} />

      <div className="rounded-xl border border-black/5 bg-slate-50 p-3 text-xs">
        <span className="font-semibold text-primary">Active Branding Terminology: </span>
        <span className="font-bold text-action" data-active-branding-terminology>
          {currentTerminology}
        </span>
        {customTerminology ? (
          <span className="ml-2 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
            Store override
          </span>
        ) : (
          <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-muted">
            Platform default
          </span>
        )}
      </div>

      <div>
        <label htmlFor="branding-terminology" className={labelClass}>
          Branding terminology
        </label>
        <input
          id="branding-terminology"
          name="platformBrandingTerminology"
          type="text"
          maxLength={120}
          value={terminology}
          onChange={(e) => setTerminology(e.target.value)}
          placeholder={defaultTerminology}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-primary-muted">
          Used on Stripe Checkout line items, storefront footers, transactional email footers, and
          platform credits. Leave blank to reset to the default ({defaultTerminology}).
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="apply-to-all"
          name="applyToAll"
          type="checkbox"
          checked={applyToAll}
          onChange={(e) => setApplyToAll(e.target.checked)}
          className="h-4 w-4 rounded border-black/20 text-action focus:ring-action"
        />
        <label htmlFor="apply-to-all" className="text-xs font-semibold text-primary cursor-pointer">
          Apply this branding terminology to all client stores
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className={buttonClass}>
          {saving ? "Saving…" : "Save platform branding"}
        </button>
        {customTerminology && (
          <button
            type="button"
            onClick={() => setTerminology("")}
            className="text-xs font-semibold text-primary-muted hover:underline"
          >
            Clear override
          </button>
        )}
      </div>

      <BrandingFormMessage state={state} />
    </form>
  );
}
