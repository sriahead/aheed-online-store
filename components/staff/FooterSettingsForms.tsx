"use client";

import { useActionState } from "react";
import { updateFooterContact, updateFooterHours } from "@/features/admin/storefront";
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
  MAX_OPENING_HOURS_ROWS,
  OPENING_HOURS_TEXT_MAX,
  PAYMENT_BADGE_FIELD,
  initialFooterHoursState,
  openingHoursLabelField,
  openingHoursValueField,
} from "@/lib/footer-hours-form";
import {
  PAYMENT_BADGE_DETAILS,
  PAYMENT_BADGE_METHODS,
  type PaymentBadgeMethodName,
} from "@/lib/payment-badges";

/**
 * The storefront footer's two settings forms on `/staff/storefront` (#1055): "Footer contact &
 * legal" and "Opening hours & payment badges". Each is its own sibling `<form>` with its own action,
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
  openingHours: { label: string; hours: string }[];
  paymentBadges: PaymentBadgeMethodName[];
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

  const rows = Array.from(
    { length: MAX_OPENING_HOURS_ROWS },
    (_, index) => initial.openingHours[index] ?? { label: "", hours: "" },
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
            Up to {MAX_OPENING_HOURS_ROWS} rows, shown in this order. Write each row the way you
            want shoppers to read it (for example &quot;Monday – Friday&quot; and &quot;9am –
            8pm&quot;). Clear both boxes in a row to remove it. With no rows, the footer hides
            opening hours.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="sr-only" htmlFor={openingHoursLabelField(index)}>
                Row {index + 1} label
              </label>
              <input
                id={openingHoursLabelField(index)}
                name={openingHoursLabelField(index)}
                type="text"
                maxLength={OPENING_HOURS_TEXT_MAX}
                defaultValue={row.label}
                className={fieldClass(hoursState.field === openingHoursLabelField(index))}
                placeholder="Day or days"
              />
              <label className="sr-only" htmlFor={openingHoursValueField(index)}>
                Row {index + 1} hours
              </label>
              <input
                id={openingHoursValueField(index)}
                name={openingHoursValueField(index)}
                type="text"
                maxLength={OPENING_HOURS_TEXT_MAX}
                defaultValue={row.hours}
                className={fieldClass(hoursState.field === openingHoursValueField(index))}
                placeholder="Hours"
              />
            </div>
          ))}
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
    </div>
  );
}
