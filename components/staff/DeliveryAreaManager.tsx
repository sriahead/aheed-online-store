"use client";

import { useActionState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { addDeliveryArea, removeDeliveryArea } from "@/features/admin/delivery-areas";
import { initialDeliveryAreaState, type DeliveryAreaFormState } from "@/lib/delivery-area-form";
import type { DeliveryAreaRow } from "@/lib/repositories/delivery-areas";
import { buttonClass, labelClass, uppercaseInputClass as inputClass } from "@/lib/form-classes";

/**
 * Delivery-area admin forms (P9.2, #612).
 *
 * Client components ONLY because `useActionState` is what surfaces a server action's error text
 * beside the field that caused it — the forms themselves are real `<form action={...}>` elements
 * and submit without JavaScript. Same pattern as `BrandManager.tsx`.
 *
 * `initialDeliveryAreaState` is imported from `lib/delivery-area-form.ts`, NOT from the
 * `"use server"` actions module beside it. A `"use server"` file may export only async functions,
 * and a value export there makes every action in it 500 at runtime while every build and test stays
 * green (#159).
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

function Feedback({ state }: { state: DeliveryAreaFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return <p className="mt-2 text-sm text-primary-muted">Saved.</p>;
  }
  return null;
}

export function AddDeliveryAreaForm() {
  const [state, action, pending] = useActionState(addDeliveryArea, initialDeliveryAreaState);

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className={labelClass} htmlFor="new-delivery-prefix">
          Postcode area
        </label>
        <input
          id="new-delivery-prefix"
          name="prefix"
          placeholder="MK"
          maxLength={2}
          className={inputClass}
          required
        />
        <p className="mt-1 text-xs text-primary-muted">
          One or two letters — the area, not the district. Adding <strong>MK</strong> covers every
          MK district, from MK1 to MK19.
        </p>
      </div>
      <button type="submit" className={buttonClass} disabled={pending}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {pending ? "Adding…" : "Add area"}
      </button>
      <div className="sm:sr-only">
        <Feedback state={state} />
      </div>
    </form>
  );
}

/**
 * One area's remove form.
 *
 * Its own `<form>` per row rather than one form with many buttons, so a refusal (removing the last
 * remaining area) renders against the row it actually concerns rather than at the top of the list.
 */
export function DeliveryAreaRowForm({ area }: { area: DeliveryAreaRow }) {
  const [state, action, pending] = useActionState(removeDeliveryArea, initialDeliveryAreaState);

  return (
    <li className="flex flex-col gap-2 border-b border-black/5 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-2 font-semibold text-primary">
          <MapPin className="h-4 w-4 text-primary-subtle" aria-hidden="true" />
          {area.prefix}
        </span>
        <form action={action}>
          <input type="hidden" name="areaId" value={area.id} />
          <button
            type="submit"
            disabled={pending}
            aria-label={`Remove delivery area ${area.prefix}`}
            className="inline-flex items-center gap-2 rounded-full border border-black/15 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {pending ? "Removing…" : "Remove"}
          </button>
        </form>
      </div>
      <Feedback state={state} />
    </li>
  );
}
