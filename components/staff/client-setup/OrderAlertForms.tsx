"use client";

import { useActionState } from "react";
import {
  addOrderAlertRecipientAction,
  removeOrderAlertRecipientAction,
  sendTestOrderAlertAction,
} from "@/app/(admin)/staff/platform/client-setup/actions";
import { initialClientSetupFormState } from "@/lib/client-setup/form-state";
import { buttonClass, inputClass, labelClass } from "@/lib/form-classes";
import { Icon } from "@/components/icons/Icon";
import { FormMessage } from "./EmailSetupForms";

/**
 * #1390 — the Client Setup "Order alerts" card's controls. Each posts to a server action that
 * re-checks the platform-admin gate itself; hiding these forms is courtesy, not the control.
 */

export function AddOrderAlertRecipientForm({ vendorId }: { vendorId: string }) {
  const [state, action, saving] = useActionState(
    addOrderAlertRecipientAction,
    initialClientSetupFormState,
  );
  return (
    <form action={action} className="space-y-3" data-client-setup-form="add-alert-recipient">
      <FormMessage state={state} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="alert-channel">
            Channel
          </label>
          <select id="alert-channel" name="channel" defaultValue="TELEGRAM" className={inputClass}>
            <option value="TELEGRAM">Telegram</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="alert-destination">
            Chat ID
          </label>
          <input
            id="alert-destination"
            name="destination"
            type="text"
            inputMode="numeric"
            required
            placeholder="-1001234567890"
            className={inputClass}
          />
        </div>
      </div>
      <button type="submit" disabled={saving} className={buttonClass}>
        <Icon name="plus" className="h-4 w-4" />
        {saving ? "Adding…" : "Add recipient"}
      </button>
    </form>
  );
}

export function RemoveOrderAlertRecipientButton({
  vendorId,
  id,
}: {
  vendorId: string;
  id: string;
}) {
  const [state, action, removing] = useActionState(
    removeOrderAlertRecipientAction,
    initialClientSetupFormState,
  );
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="id" value={id} />
      {state.message && !state.ok && (
        <span role="alert" className="text-xs text-danger">
          {state.message}
        </span>
      )}
      <button
        type="submit"
        disabled={removing}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-tint"
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
        {removing ? "Removing…" : "Remove"}
      </button>
    </form>
  );
}

export function TestOrderAlertButton({ vendorId, id }: { vendorId: string; id: string }) {
  const [state, action, sending] = useActionState(
    sendTestOrderAlertAction,
    initialClientSetupFormState,
  );
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="id" value={id} />
      {state.message && (
        <span
          role={state.ok ? "status" : "alert"}
          className={`text-xs ${state.ok ? "text-primary" : "text-danger"}`}
        >
          {state.message}
        </span>
      )}
      <button
        type="submit"
        disabled={sending}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-action hover:bg-action-tint"
      >
        <Icon name="bell-ring" className="h-3.5 w-3.5" />
        {sending ? "Sending…" : "Send test alert"}
      </button>
    </form>
  );
}
