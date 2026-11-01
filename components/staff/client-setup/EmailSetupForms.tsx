"use client";

import { useActionState } from "react";
import {
  addInboundAddressAction,
  removeInboundAddressAction,
  saveSenderAction,
  sendTestEmailAction,
} from "@/app/(admin)/staff/platform/client-setup/actions";
import {
  initialClientSetupFormState,
  type ClientSetupFormState,
} from "@/lib/client-setup/form-state";
import { buttonClass, inputClass, labelClass } from "@/lib/form-classes";
import { Icon } from "@/components/icons/Icon";

/**
 * #1217 — the Client Setup Email section's four controls. Each posts to a server action that
 * re-checks the platform-admin gate itself; hiding these forms is courtesy, not the control.
 */

function FormMessage({ state }: { state: ClientSetupFormState }) {
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

export function SenderForm({
  vendorId,
  senderName,
  senderEmail,
}: {
  vendorId: string;
  senderName: string;
  senderEmail: string;
}) {
  const [state, action, saving] = useActionState(saveSenderAction, initialClientSetupFormState);
  return (
    <form action={action} className="space-y-3" data-client-setup-form="sender">
      <FormMessage state={state} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="senderName">
            Sender name
          </label>
          <input
            id="senderName"
            name="senderName"
            required
            maxLength={120}
            defaultValue={senderName}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="senderEmail">
            Sender email
          </label>
          <input
            id="senderEmail"
            name="senderEmail"
            type="email"
            required
            defaultValue={senderEmail}
            className={inputClass}
          />
        </div>
      </div>
      <button type="submit" disabled={saving} className={buttonClass}>
        <Icon name="save" className="h-4 w-4" />
        {saving ? "Saving…" : "Save sender"}
      </button>
    </form>
  );
}

export function AddInboundAddressForm({ vendorId }: { vendorId: string }) {
  const [state, action, saving] = useActionState(
    addInboundAddressAction,
    initialClientSetupFormState,
  );
  return (
    <form action={action} className="space-y-3" data-client-setup-form="add-address">
      <FormMessage state={state} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="address">
            Receiving address
          </label>
          <input id="address" name="address" type="email" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="purpose">
            Purpose
          </label>
          <select id="purpose" name="purpose" defaultValue="ORDERS" className={inputClass}>
            <option value="ORDERS">Orders</option>
            <option value="SUPPORT">Support</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="forwardTo">
            Forward to (the store&apos;s real mailbox)
          </label>
          <input id="forwardTo" name="forwardTo" type="email" required className={inputClass} />
        </div>
      </div>
      <button type="submit" disabled={saving} className={buttonClass}>
        <Icon name="plus" className="h-4 w-4" />
        {saving ? "Adding…" : "Add address"}
      </button>
    </form>
  );
}

export function RemoveInboundAddressButton({ vendorId, id }: { vendorId: string; id: string }) {
  const [state, action, removing] = useActionState(
    removeInboundAddressAction,
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

export function TestEmailButton({
  vendorId,
  adminEmail,
}: {
  vendorId: string;
  adminEmail: string;
}) {
  const [state, action, sending] = useActionState(sendTestEmailAction, initialClientSetupFormState);
  return (
    <form action={action} className="space-y-3" data-client-setup-form="test-email">
      <FormMessage state={state} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <p className="text-xs text-primary-muted">Sends to your own address: {adminEmail}</p>
      <button type="submit" disabled={sending} className={buttonClass}>
        <Icon name="mail" className="h-4 w-4" />
        {sending ? "Sending…" : "Send test email"}
      </button>
    </form>
  );
}
