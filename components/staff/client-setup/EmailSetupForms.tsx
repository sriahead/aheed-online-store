"use client";

import { useActionState, useRef, useState } from "react";
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
import type { InboundDefaultForward } from "@/lib/config";
import type { DestinationsResult } from "@/lib/email/destinations";
import type { SuggestedSender } from "@/lib/client-setup/sender-suggestion";
import { DESTINATIONS_UNAVAILABLE_MESSAGE } from "@/lib/client-setup/destination-copy";

/**
 * #1217 — the Client Setup Email section's four controls. Each posts to a server action that
 * re-checks the platform-admin gate itself; hiding these forms is courtesy, not the control.
 */

export function FormMessage({ state }: { state: ClientSetupFormState }) {
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
  suggestion,
}: {
  vendorId: string;
  senderName: string;
  senderEmail: string;
  /** #1403 — the suggested sender; the button fills the inputs and the admin still saves. */
  suggestion: SuggestedSender | null;
}) {
  const [state, action, saving] = useActionState(saveSenderAction, initialClientSetupFormState);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const showSuggestion =
    suggestion !== null &&
    (suggestion.name !== senderName ||
      suggestion.email.toLowerCase() !== senderEmail.trim().toLowerCase());
  return (
    <form action={action} className="space-y-3" data-client-setup-form="sender">
      <FormMessage state={state} />
      {showSuggestion && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent-tint px-4 py-3 text-sm"
          data-suggested-sender
        >
          <span className="min-w-0">
            Suggested:{" "}
            <span className="font-semibold">
              {suggestion.name} &lt;{suggestion.email}&gt;
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              if (nameRef.current) nameRef.current.value = suggestion.name;
              if (emailRef.current) emailRef.current.value = suggestion.email;
            }}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-action underline"
          >
            Use suggested sender
          </button>
        </div>
      )}
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="senderName">
            Sender name
          </label>
          <input
            ref={nameRef}
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
            ref={emailRef}
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

const OTHER = "__other__";

/**
 * #1392 R6 — the initial dropdown choice: the platform default when Cloudflare has verified it;
 * the default typed into Other… when it is set but not verified; otherwise the first verified
 * mailbox, or Other… when there is none.
 */
function initialForwardChoice(
  defaultForward: InboundDefaultForward,
  verified: readonly string[],
): { choice: string; other: string } {
  if (defaultForward.status === "set") {
    return verified.includes(defaultForward.address)
      ? { choice: defaultForward.address, other: "" }
      : { choice: OTHER, other: defaultForward.address };
  }
  return verified.length > 0 ? { choice: verified[0], other: "" } : { choice: OTHER, other: "" };
}

/** #1392 R5 — Forward to as a dropdown of Cloudflare's verified destination addresses. */
function ForwardToSelect({
  defaultForward,
  addresses,
}: {
  defaultForward: InboundDefaultForward;
  addresses: readonly { email: string; verified: boolean }[];
}) {
  const verified = addresses.filter((a) => a.verified).map((a) => a.email);
  const pending = addresses.filter((a) => !a.verified).map((a) => a.email);
  const [initial] = useState(() => initialForwardChoice(defaultForward, verified));
  const [choice, setChoice] = useState(initial.choice);
  const isOther = choice === OTHER;
  return (
    <>
      <label className={labelClass} htmlFor="forwardTo">
        Forward to (the store&apos;s real mailbox)
      </label>
      {/* Exactly one forwardTo is posted: the select's, or the Other… text box's. */}
      <select
        id="forwardTo"
        name={isOther ? undefined : "forwardTo"}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className={inputClass}
      >
        {verified.map((email) => (
          <option key={email} value={email}>
            {email}
          </option>
        ))}
        {pending.map((email) => (
          <option key={email} value={email} disabled>
            {email} (awaiting verification)
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {isOther && (
        <div className="mt-2">
          <label className="sr-only" htmlFor="forwardToOther">
            Other mailbox
          </label>
          <input
            id="forwardToOther"
            name="forwardTo"
            type="email"
            required
            defaultValue={initial.other}
            aria-describedby="forwardToOther-warning"
            className={inputClass}
          />
          <p
            id="forwardToOther-warning"
            className="mt-1 text-xs font-medium text-danger"
            data-forward-other-warning
          >
            Cloudflare forwards only to verified destination addresses. Add and verify this mailbox
            in Email Routing, or mail to this address will not arrive.
          </p>
        </div>
      )}
    </>
  );
}

export function AddInboundAddressForm({
  vendorId,
  defaultForward,
  destinations,
}: {
  vendorId: string;
  /** #1399 — the platform default inbox prefills Forward to; it stays editable and required. */
  defaultForward: InboundDefaultForward;
  /** #1392 — Cloudflare's destination addresses, or why they could not be read. */
  destinations: DestinationsResult;
}) {
  const prefill = defaultForward.status === "set" ? defaultForward.address : "";
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
          {destinations.status === "ok" ? (
            <ForwardToSelect defaultForward={defaultForward} addresses={destinations.addresses} />
          ) : (
            <>
              <label className={labelClass} htmlFor="forwardTo">
                Forward to (the store&apos;s real mailbox)
              </label>
              <input
                id="forwardTo"
                name="forwardTo"
                type="email"
                required
                defaultValue={prefill}
                aria-describedby={prefill ? "forwardTo-hint" : undefined}
                className={inputClass}
              />
              {prefill && (
                <p id="forwardTo-hint" className="mt-1 text-xs text-primary-muted">
                  The platform default inbox. Change it if this store has its own mailbox.
                </p>
              )}
              <p className="mt-1 text-xs text-primary-muted" data-destinations-unavailable>
                {DESTINATIONS_UNAVAILABLE_MESSAGE[destinations.reason]}
              </p>
            </>
          )}
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
