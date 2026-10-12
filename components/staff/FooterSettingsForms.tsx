"use client";

import { useActionState } from "react";
import {
  deleteHoursOverride,
  saveHoursOverride,
  updateFooterContact,
  updateFooterHours,
} from "@/features/admin/storefront";
import {
  COMPANY_NUMBER_FIELD,
  CONTACT_EMAIL_FIELD,
  CONTACT_PHONE_FIELD,
  OPENING_HOURS_NOTE_FIELD,
  REGISTERED_OFFICE_FIELD,
  SECURE_CHECKOUT_NOTE_FIELD,
  VAT_NUMBER_FIELD,
  initialFooterContactState,
} from "@/lib/footer-contact-form";
import {
  OVERRIDE_CLOSE_FIELD,
  OVERRIDE_CLOSED_FIELD,
  OVERRIDE_DATE_FIELD,
  OVERRIDE_ID_FIELD,
  OVERRIDE_LABEL_FIELD,
  OVERRIDE_LABEL_MAX,
  OVERRIDE_OPEN_FIELD,
  PAYMENT_BADGE_FIELD,
  WEEKDAYS,
  initialFooterHoursState,
  initialHoursOverrideState,
  weekdayCloseField,
  weekdayClosedField,
  weekdayOpenField,
} from "@/lib/footer-hours-form";
import {
  formatHours,
  formatOverrideDate,
  type HoursOverrideRow,
  type WeeklyHoursRow,
} from "@/lib/footer-hours";
import {
  PAYMENT_BADGE_DETAILS,
  PAYMENT_BADGE_METHODS,
  type PaymentBadgeMethodName,
} from "@/lib/payment-badges";

/**
 * The storefront footer's settings forms on `/staff/storefront` (#1055, #1060): "Footer contact &
 * legal", "Opening hours & payment badges" and "Holiday & closure dates". Each is its own sibling `<form>` with its own action,
 * like every form on that page, so saving one never touches the fields of another.
 *
 * Its own component rather than two more sections inside `StorefrontConfigForm`, following the
 * `ReviewLinksManager` precedent on the same page.
 */

function fieldClass(hasError: boolean): string {
  return `rounded-lg border p-3 ${hasError ? "border-danger bg-danger-tint" : "border-black/20"}`;
}

export interface FooterSettingsValues {
  contactPhone: string | null;
  contactEmail: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  registeredOffice: string | null;
  openingHoursNote: string | null;
  showSecureCheckoutNote: boolean;
  weeklyHours: WeeklyHoursRow[];
  paymentBadges: PaymentBadgeMethodName[];
  /** #1060 — the vendor's overrides dated today onwards, ascending. */
  upcomingOverrides: (HoursOverrideRow & { id: string })[];
  /** #1060 — the store's calendar day (`YYYY-MM-DD`), the earliest date the date input offers. */
  today: string;
}

const CONTACT_FIELDS = [
  {
    name: CONTACT_PHONE_FIELD,
    label: "Phone number",
    help: "Shown in the footer with a tap-to-call link.",
    placeholder: "e.g. 01234 567890",
  },
  {
    name: CONTACT_EMAIL_FIELD,
    label: "Email address",
    help: "Shown in the footer with a link that opens the shopper's email app.",
    placeholder: "e.g. hello@yourshop.co.uk",
  },
  {
    name: COMPANY_NUMBER_FIELD,
    label: "Company number",
    help: "Your Companies House number, up to 20 characters.",
    placeholder: "e.g. 12345678",
  },
  {
    name: VAT_NUMBER_FIELD,
    label: "VAT number",
    help: "Up to 20 characters.",
    placeholder: "e.g. GB123456789",
  },
  {
    name: REGISTERED_OFFICE_FIELD,
    label: "Registered office",
    help: "Your registered office address, up to 200 characters.",
    placeholder: "",
  },
  {
    name: OPENING_HOURS_NOTE_FIELD,
    label: "Opening hours note",
    help: "One line shown under your opening hours, up to 200 characters.",
    placeholder: "",
  },
] as const;

export function FooterSettingsForms({ initial }: { initial: FooterSettingsValues }) {
  const [contactState, saveContact, contactPending] = useActionState(
    updateFooterContact,
    initialFooterContactState,
  );
  const [hoursState, saveHours, hoursPending] = useActionState(
    updateFooterHours,
    initialFooterHoursState,
  );

  const [overrideState, saveOverride, overridePending] = useActionState(
    saveHoursOverride,
    initialHoursOverrideState,
  );

  return (
    <div className="flex flex-col gap-10">
      <form action={saveContact} className="flex flex-col gap-6">
        <div>
          <h2 className="font-bold text-black">Footer contact &amp; legal</h2>
          <p className="mt-1 text-sm text-black/60">
            What your storefront footer shows about your shop. Leave a field blank to hide it —
            nothing is shown in its place. The address comes from your Collection Location above.
          </p>
        </div>

        {CONTACT_FIELDS.map((field) => (
          <div key={field.name} className="flex flex-col gap-2">
            <label htmlFor={field.name} className="font-bold text-black">
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type="text"
              defaultValue={initial[field.name] ?? ""}
              className={fieldClass(contactState.field === field.name)}
              placeholder={field.placeholder}
            />
            <p className="text-xs text-black/60">{field.help}</p>
          </div>
        ))}

        <label className="flex items-center gap-3 font-bold text-black">
          <input
            type="checkbox"
            name={SECURE_CHECKOUT_NOTE_FIELD}
            defaultChecked={initial.showSecureCheckoutNote}
            className="h-5 w-5"
          />
          Show &quot;Secure checkout powered by Stripe&quot;
        </label>

        {contactState.error && (
          <p className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
            {contactState.error}
          </p>
        )}
        {contactState.saved && !contactState.error && (
          <p className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary">
            Footer contact &amp; legal details saved.
          </p>
        )}

        <button
          type="submit"
          disabled={contactPending}
          className="rounded-full bg-primary py-3 font-bold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {contactPending ? "Saving…" : "Save Footer Contact & Legal"}
        </button>
      </form>

      <form action={saveHours} className="flex flex-col gap-6">
        <div>
          <h2 className="font-bold text-black">Opening hours &amp; payment badges</h2>
          <p className="mt-1 text-sm text-black/60">
            Your usual hours for each day. Tick &quot;Closed all day&quot; for a day you never open.
            Leave a day&apos;s times empty to leave it out of the footer. With no days set, the
            footer hides opening hours.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {WEEKDAYS.map(({ dayOfWeek, name }) => {
            const row = initial.weeklyHours.find((r) => r.dayOfWeek === dayOfWeek);
            return (
              <fieldset
                key={dayOfWeek}
                className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[8rem_1fr_1fr_auto]"
              >
                <legend className="sr-only">{name}</legend>
                <span aria-hidden="true" className="col-span-2 font-bold text-black sm:col-span-1">
                  {name}
                </span>
                <label className="flex flex-col gap-1 text-xs text-black/60">
                  Opens
                  <input
                    id={weekdayOpenField(dayOfWeek)}
                    name={weekdayOpenField(dayOfWeek)}
                    type="time"
                    aria-label={`${name} opening time`}
                    defaultValue={row?.openTime ?? ""}
                    className={fieldClass(hoursState.field === weekdayOpenField(dayOfWeek))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-black/60">
                  Closes
                  <input
                    id={weekdayCloseField(dayOfWeek)}
                    name={weekdayCloseField(dayOfWeek)}
                    type="time"
                    aria-label={`${name} closing time`}
                    defaultValue={row?.closeTime ?? ""}
                    className={fieldClass(hoursState.field === weekdayCloseField(dayOfWeek))}
                  />
                </label>
                <label className="col-span-2 flex min-h-tap items-center gap-2 text-black sm:col-span-1">
                  <input
                    type="checkbox"
                    name={weekdayClosedField(dayOfWeek)}
                    aria-label={`${name} closed all day`}
                    defaultChecked={row?.closed ?? false}
                    className="h-5 w-5"
                  />
                  Closed all day
                </label>
              </fieldset>
            );
          })}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-bold text-black">Payment badges in the footer</legend>
          {PAYMENT_BADGE_METHODS.map((method) => (
            <label key={method} className="flex items-center gap-3 text-black">
              <input
                type="checkbox"
                name={PAYMENT_BADGE_FIELD}
                value={method}
                defaultChecked={initial.paymentBadges.includes(method)}
                className="h-5 w-5"
              />
              {PAYMENT_BADGE_DETAILS[method].label}
            </label>
          ))}
        </fieldset>

        {hoursState.error && (
          <p className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
            {hoursState.error}
          </p>
        )}
        {hoursState.saved && !hoursState.error && (
          <p className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary">
            Opening hours &amp; payment badges saved.
          </p>
        )}

        <button
          type="submit"
          disabled={hoursPending}
          className="rounded-full bg-primary py-3 font-bold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {hoursPending ? "Saving…" : "Save Opening Hours & Badges"}
        </button>
      </form>

      <section className="flex flex-col gap-6">
        <form action={saveOverride} className="flex flex-col gap-6">
          <div>
            <h2 className="font-bold text-black">Holiday &amp; closure dates</h2>
            <p className="mt-1 text-sm text-black/60">
              Different hours, or a closure, on one date. The footer lists dates in the next 14 days
              under &quot;Holiday hours&quot;, and on the day itself shows them in place of your
              usual hours. Saving a date that already has an entry replaces it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 font-bold text-black">
              Date
              <input
                name={OVERRIDE_DATE_FIELD}
                type="date"
                min={initial.today}
                required
                className={fieldClass(overrideState.field === OVERRIDE_DATE_FIELD)}
              />
            </label>
            <label className="flex flex-col gap-2 font-bold text-black">
              Name
              <input
                name={OVERRIDE_LABEL_FIELD}
                type="text"
                maxLength={OVERRIDE_LABEL_MAX}
                placeholder="e.g. a public holiday"
                className={fieldClass(overrideState.field === OVERRIDE_LABEL_FIELD)}
              />
            </label>
            <label className="flex flex-col gap-2 font-bold text-black">
              Opens
              <input
                name={OVERRIDE_OPEN_FIELD}
                type="time"
                className={fieldClass(overrideState.field === OVERRIDE_OPEN_FIELD)}
              />
            </label>
            <label className="flex flex-col gap-2 font-bold text-black">
              Closes
              <input
                name={OVERRIDE_CLOSE_FIELD}
                type="time"
                className={fieldClass(overrideState.field === OVERRIDE_CLOSE_FIELD)}
              />
            </label>
          </div>
          <label className="flex items-center gap-3 font-bold text-black">
            <input type="checkbox" name={OVERRIDE_CLOSED_FIELD} className="h-5 w-5" />
            Closed all day
          </label>

          {overrideState.error && (
            <p className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
              {overrideState.error}
            </p>
          )}
          {overrideState.saved && !overrideState.error && (
            <p className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary">
              Date saved.
            </p>
          )}

          <button
            type="submit"
            disabled={overridePending}
            className="rounded-full bg-primary py-3 font-bold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {overridePending ? "Saving…" : "Save Date"}
          </button>
        </form>

        {initial.upcomingOverrides.length === 0 ? (
          <p className="text-sm text-black/60">No upcoming dates.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/10 rounded-xl border border-black/10">
            {initial.upcomingOverrides.map((override) => (
              <OverrideRow key={override.id} override={override} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One upcoming override with its own Delete form, so each delete reports against its own row. */
function OverrideRow({ override }: { override: HoursOverrideRow & { id: string } }) {
  const [state, remove, pending] = useActionState(deleteHoursOverride, initialHoursOverrideState);
  const date = formatOverrideDate(override.date);
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3 text-black">
      <span>
        <span className="font-bold">{date}</span> · {override.label} · {formatHours(override)}
        {state.error && <span className="ml-2 text-sm text-danger">{state.error}</span>}
      </span>
      <form action={remove}>
        <input type="hidden" name={OVERRIDE_ID_FIELD} value={override.id} />
        <button
          type="submit"
          disabled={pending}
          aria-label={`Delete ${date} ${override.label}`}
          className="min-h-tap rounded-full border border-black/20 px-4 text-sm font-bold disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </form>
    </li>
  );
}
