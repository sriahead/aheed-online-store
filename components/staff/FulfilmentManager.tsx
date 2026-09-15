"use client";

import { useActionState } from "react";
import { CalendarClock, Plus, Timer, Trash2, Truck } from "lucide-react";
import {
  addExpressWindow,
  addFulfilmentSlot,
  removeExpressWindow,
  removeFulfilmentSlot,
  saveFulfilmentSettings,
} from "@/features/admin/fulfilment";
import {
  DAY_NAMES,
  dayName,
  initialFulfilmentState,
  MAX_BOOKING_WINDOW_DAYS,
  MAX_SLOT_HOLD_MINUTES,
  type FulfilmentFormState,
} from "@/lib/fulfilment-form";
import type {
  ExpressWindowRow,
  FulfilmentSettings,
  FulfilmentSlotRow,
} from "@/lib/repositories/fulfilment-slots";
import { inputClass, labelClass } from "@/lib/form-classes";
import { Button } from "@/components/ui/Button";

/**
 * Fulfilment-scheduling admin forms (P10, #750).
 *
 * Client components ONLY because `useActionState` is what surfaces a server action's error text
 * beside the field that caused it — the forms themselves are real `<form action={...}>` elements and
 * submit without JavaScript. Same pattern as `DeliveryAreaManager.tsx`.
 *
 * `initialFulfilmentState` is imported from `lib/fulfilment-form.ts`, NOT from the `"use server"`
 * actions module beside it. A `"use server"` file may export only async functions, and a value
 * export there makes every action in it 500 at runtime while every build and test stays green
 * (#159).
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

function Feedback({ state }: { state: FulfilmentFormState }) {
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

function DayOptions() {
  return (
    <>
      {DAY_NAMES.map((name, index) => (
        <option key={name} value={index}>
          {name}
        </option>
      ))}
    </>
  );
}

/**
 * The four settings `#401`/`#402` read and nothing could write.
 *
 * `expressCollectionEnabled` is disabled when the vendor does not offer collection at all: the flag
 * would persist, but `SlotPicker` gates express on the collection method, so enabling it would be a
 * control with no reachable effect (#750 R15a). The explanation renders beside it rather than the
 * control simply being absent, so an admin can see why and where to change it.
 */
export function FulfilmentSettingsForm({ settings }: { settings: FulfilmentSettings }) {
  const [state, action, pending] = useActionState(saveFulfilmentSettings, initialFulfilmentState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <input
          id="offerDeliverySlots"
          type="checkbox"
          name="offerDeliverySlots"
          defaultChecked={settings.offerDeliverySlots}
          aria-describedby="offerDeliverySlots-hint"
          className="mt-1 h-4 w-4"
        />
        <div>
          <label htmlFor="offerDeliverySlots" className="text-sm font-semibold text-primary">
            Offer delivery time slots
          </label>
          <p id="offerDeliverySlots-hint" className="text-xs text-primary-muted">
            When off, delivery customers check out without choosing a time window.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <input
          id="expressCollectionEnabled"
          type="checkbox"
          name="expressCollectionEnabled"
          defaultChecked={settings.expressCollectionEnabled}
          disabled={!settings.offerCollection}
          aria-describedby="expressCollectionEnabled-hint"
          className="mt-1 h-4 w-4"
        />
        <div>
          <label htmlFor="expressCollectionEnabled" className="text-sm font-semibold text-primary">
            Offer 60-minute express collection
          </label>
          <p id="expressCollectionEnabled-hint" className="text-xs text-primary-muted">
            {settings.offerCollection
              ? "Shown during an express window below, when the shop is open for collection."
              : "Unavailable until Click & Collect is switched on in Storefront → delivery rules."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="bookingWindowDays">
            Booking window (days)
          </label>
          <input
            id="bookingWindowDays"
            name="bookingWindowDays"
            type="number"
            min={1}
            max={MAX_BOOKING_WINDOW_DAYS}
            defaultValue={settings.bookingWindowDays}
            className={inputClass}
            required
          />
          <p className="mt-1 text-xs text-primary-muted">
            How far ahead a customer can book. Maximum {MAX_BOOKING_WINDOW_DAYS}.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="slotHoldDurationMinutes">
            Slot hold (minutes)
          </label>
          <input
            id="slotHoldDurationMinutes"
            name="slotHoldDurationMinutes"
            type="number"
            min={1}
            max={MAX_SLOT_HOLD_MINUTES}
            defaultValue={settings.slotHoldDurationMinutes}
            className={inputClass}
            required
          />
          <p className="mt-1 text-xs text-primary-muted">
            How long an unpaid order keeps its slot before the space is released again.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Add one weekly slot. Collection is offered as a method only when the vendor offers collection. */
export function AddFulfilmentSlotForm({ offerCollection }: { offerCollection: boolean }) {
  const [state, action, pending] = useActionState(addFulfilmentSlot, initialFulfilmentState);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6 sm:items-end">
      <div className="sm:col-span-1">
        <label className={labelClass} htmlFor="slot-method">
          Method
        </label>
        <select id="slot-method" name="method" className={inputClass} defaultValue="DELIVERY">
          <option value="DELIVERY">Delivery</option>
          {offerCollection && <option value="COLLECTION">Collection</option>}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="slot-day">
          Day
        </label>
        <select id="slot-day" name="dayOfWeek" className={inputClass} defaultValue={1}>
          <DayOptions />
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="slot-start">
          From
        </label>
        <input id="slot-start" name="startTime" type="time" className={inputClass} required />
      </div>

      <div>
        <label className={labelClass} htmlFor="slot-end">
          To
        </label>
        <input id="slot-end" name="endTime" type="time" className={inputClass} required />
      </div>

      <div>
        <label className={labelClass} htmlFor="slot-capacity">
          Orders
        </label>
        <input
          id="slot-capacity"
          name="capacity"
          type="number"
          min={1}
          defaultValue={10}
          className={inputClass}
          required
        />
      </div>

      <div className="sm:col-span-6">
        <Button disabled={pending}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {pending ? "Adding…" : "Add slot"}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/**
 * One slot's remove form.
 *
 * Its own `<form>` per row rather than one form with many buttons, so a refusal renders against the
 * row it actually concerns rather than at the top of the list.
 */
export function FulfilmentSlotRowForm({ slot }: { slot: FulfilmentSlotRow }) {
  const [state, action, pending] = useActionState(removeFulfilmentSlot, initialFulfilmentState);
  const label = `${dayName(slot.dayOfWeek)} ${slot.startTime}–${slot.endTime}`;

  return (
    <li className="flex flex-col gap-2 border-b border-black/5 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-2 text-primary">
          {slot.method === "DELIVERY" ? (
            <Truck className="h-4 w-4 text-primary-subtle" aria-hidden="true" />
          ) : (
            <CalendarClock className="h-4 w-4 text-primary-subtle" aria-hidden="true" />
          )}
          <span className="font-semibold">{label}</span>
          <span className="text-sm text-primary-muted">
            {slot.method === "DELIVERY" ? "Delivery" : "Collection"} · up to {slot.capacity}{" "}
            {slot.capacity === 1 ? "order" : "orders"}
          </span>
        </span>
        <form action={action}>
          <input type="hidden" name="slotId" value={slot.id} />
          <button
            type="submit"
            disabled={pending}
            aria-label={`Remove ${slot.method === "DELIVERY" ? "delivery" : "collection"} slot ${label}`}
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

/** Add one express-collection window. */
export function AddExpressWindowForm() {
  const [state, action, pending] = useActionState(addExpressWindow, initialFulfilmentState);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="express-day">
          Day
        </label>
        <select id="express-day" name="dayOfWeek" className={inputClass} defaultValue={1}>
          <DayOptions />
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="express-open">
          Opens
        </label>
        <input id="express-open" name="openTime" type="time" className={inputClass} required />
      </div>

      <div>
        <label className={labelClass} htmlFor="express-close">
          Closes
        </label>
        <input id="express-close" name="closeTime" type="time" className={inputClass} required />
      </div>

      <div className="sm:col-span-4">
        <Button disabled={pending}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {pending ? "Adding…" : "Add window"}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** One express window's remove form. */
export function ExpressWindowRowForm({ expressWindow }: { expressWindow: ExpressWindowRow }) {
  const [state, action, pending] = useActionState(removeExpressWindow, initialFulfilmentState);
  const label = `${dayName(expressWindow.dayOfWeek)} ${expressWindow.openTime}–${expressWindow.closeTime}`;

  return (
    <li className="flex flex-col gap-2 border-b border-black/5 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-2 font-semibold text-primary">
          <Timer className="h-4 w-4 text-primary-subtle" aria-hidden="true" />
          {label}
        </span>
        <form action={action}>
          <input type="hidden" name="windowId" value={expressWindow.id} />
          <button
            type="submit"
            disabled={pending}
            aria-label={`Remove express window ${label}`}
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
