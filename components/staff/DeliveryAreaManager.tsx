"use client";

import { useActionState } from "react";
import { MapPin, Plus, Save, Trash2 } from "lucide-react";
import {
  addDeliveryArea,
  removeDeliveryArea,
  updateDeliveryAreaCharges,
} from "@/features/admin/delivery-areas";
import {
  AREA_FEE_FIELD,
  AREA_MINIMUM_FIELD,
  AREA_THRESHOLD_FIELD,
  initialDeliveryAreaState,
  type DeliveryAreaFormState,
} from "@/lib/delivery-area-form";
import { penceToPoundsValue } from "@/lib/delivery-rules-form";
import type { DeliveryAreaRow } from "@/lib/repositories/delivery-areas";
import { formatPrice } from "@/components/product/format-price";
import {
  inputClass as plainInputClass,
  labelClass,
  uppercaseInputClass as inputClass,
} from "@/lib/form-classes";
import { Button } from "@/components/ui/Button";

/**
 * Delivery-area admin forms (P9.2 #612; lists, ranges and per-area charges #613/#890).
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

/** The store-wide defaults a blank per-area charge falls back to, for display only. */
export interface StoreDefaultCharges {
  deliveryFeePence: number;
  minimumOrderPence: number;
  freeDeliveryThresholdPence: number | null;
}

/** Visible at every width (#613 R14): a bulk add's counts are the only record of what it did. */
function Feedback({ state }: { state: DeliveryAreaFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p role="status" className="mt-2 text-sm text-primary-muted">
        {state.message ?? "Saved."}
      </p>
    );
  }
  return null;
}

/** The three optional money inputs, shared by the add form and each row's edit form (#890). */
function ChargeFields({
  idPrefix,
  initial,
}: {
  idPrefix: string;
  initial?: Pick<
    DeliveryAreaRow,
    "deliveryFeePence" | "minimumOrderPence" | "freeDeliveryThresholdPence"
  >;
}) {
  const fields = [
    { name: AREA_FEE_FIELD, label: "Delivery charge (£)", value: initial?.deliveryFeePence },
    { name: AREA_MINIMUM_FIELD, label: "Minimum order (£)", value: initial?.minimumOrderPence },
    {
      name: AREA_THRESHOLD_FIELD,
      label: "Free delivery over (£)",
      value: initial?.freeDeliveryThresholdPence,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {fields.map((field) => (
        <div key={field.name}>
          <label className={labelClass} htmlFor={`${idPrefix}-${field.name}`}>
            {field.label}
          </label>
          <input
            id={`${idPrefix}-${field.name}`}
            name={field.name}
            inputMode="decimal"
            placeholder="Store default"
            defaultValue={penceToPoundsValue(field.value)}
            className={plainInputClass}
          />
        </div>
      ))}
    </div>
  );
}

export function AddDeliveryAreaForm() {
  const [state, action, pending] = useActionState(addDeliveryArea, initialDeliveryAreaState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className={labelClass} htmlFor="new-delivery-prefix">
            Postcode areas or districts
          </label>
          <input
            id="new-delivery-prefix"
            name="prefix"
            placeholder="MK, MK9 or MK1-MK10"
            maxLength={200}
            className={inputClass}
            required
          />
        </div>
        <Button disabled={pending}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <p className="-mt-2 text-xs text-primary-muted">
        Enter an area (e.g. <strong>MK</strong>) to cover all of its districts, or a district (e.g.{" "}
        <strong>MK9</strong>) to cover just that one. Add several at once as a comma-separated list
        (<strong>MK1, MK3, MK5</strong>) or a range (<strong>MK1-MK10</strong>). To leave a district
        out, list the districts you do serve instead of the whole area.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-primary">
          Charges for these districts (optional)
        </summary>
        <p className="mb-3 mt-2 text-xs text-primary-muted">
          Leave blank to use the store&apos;s delivery defaults. £0 means free delivery, no minimum,
          or — for the free-delivery threshold — free delivery not offered here.
        </p>
        <ChargeFields idPrefix="new-area" />
      </details>
      <Feedback state={state} />
    </form>
  );
}

function chargeLabel(
  value: number | null,
  fallback: number | null,
  kind: "fee" | "threshold" | "minimum",
) {
  if (value === null) {
    if (fallback === null) return "Store default (none)";
    return `Store default (${formatPrice(fallback)})`;
  }
  if (kind === "threshold" && value === 0) return "Not offered";
  return formatPrice(value);
}

/**
 * One area's row: its charges, an edit form for them, and a remove form.
 *
 * Separate `<form>`s rather than one form with many buttons, so a refusal (removing the last
 * remaining area) renders against the row it actually concerns rather than at the top of the list.
 */
export function DeliveryAreaRowForm({
  area,
  defaults,
}: {
  area: DeliveryAreaRow;
  defaults: StoreDefaultCharges;
}) {
  const [state, action, pending] = useActionState(removeDeliveryArea, initialDeliveryAreaState);
  const [chargesState, chargesAction, chargesPending] = useActionState(
    updateDeliveryAreaCharges,
    initialDeliveryAreaState,
  );

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
      <dl className="grid grid-cols-1 gap-1 text-xs text-primary-muted sm:grid-cols-3">
        <div>
          <dt className="inline font-semibold">Delivery: </dt>
          <dd className="inline">
            {chargeLabel(area.deliveryFeePence, defaults.deliveryFeePence, "fee")}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">Minimum: </dt>
          <dd className="inline">
            {chargeLabel(area.minimumOrderPence, defaults.minimumOrderPence, "minimum")}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">Free over: </dt>
          <dd className="inline">
            {chargeLabel(
              area.freeDeliveryThresholdPence,
              defaults.freeDeliveryThresholdPence,
              "threshold",
            )}
          </dd>
        </div>
      </dl>
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-primary">
          Edit charges for {area.prefix}
        </summary>
        <form action={chargesAction} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="areaId" value={area.id} />
          <ChargeFields idPrefix={`area-${area.id}`} initial={area} />
          <div>
            <Button disabled={chargesPending}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {chargesPending ? "Saving…" : `Save charges for ${area.prefix}`}
            </Button>
          </div>
          <Feedback state={chargesState} />
        </form>
      </details>
      <Feedback state={state} />
    </li>
  );
}
