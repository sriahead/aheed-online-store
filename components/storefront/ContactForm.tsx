"use client";

import { useActionState } from "react";
import { submitContact } from "@/features/contact/submit-contact";
import {
  CONTACT_LIMITS,
  initialContactState,
  type ContactField,
  type ContactFormState,
} from "@/features/contact/validate-contact";

/**
 * The storefront contact form (#1409).
 *
 * A client component only because `useActionState` shows the returned errors without a
 * navigation; the Server Action sits behind a plain `<form>`, so it still submits with JavaScript
 * disabled. The `maxLength` values are the server's limits, so both refuse the same input.
 *
 * `website` is a honeypot: hidden from sight, from screen readers (`aria-hidden`) and from the tab
 * order. A person never fills it; a bot that fills every field gets a normal-looking success.
 */

const INPUT =
  "mt-2 w-full rounded-lg border border-black/10 bg-white p-3 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-action focus:ring-offset-2";
const LABEL = "text-sm font-semibold text-primary";

function FieldError({ state, field }: { state: ContactFormState; field: ContactField }) {
  const message = state.fieldErrors[field];
  if (!message) return null;
  return (
    <p id={`contact-${field}-error`} className="mt-1 text-xs text-danger">
      {message}
    </p>
  );
}

export function ContactForm({
  defaultName,
  defaultEmail,
  orders,
}: {
  defaultName: string;
  defaultEmail: string;
  /** The signed-in shopper's recent orders at this store; empty for a guest. */
  orders: { orderNumber: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(
    submitContact,
    initialContactState,
  );

  if (state.status === "success") {
    return (
      <p role="status" className="rounded-lg bg-action-tint px-4 py-3 text-sm text-action">
        Thank you. Your message to the store has been received. They will reply to {state.replyTo}.
      </p>
    );
  }

  const describedBy = (field: ContactField) =>
    state.fieldErrors[field] ? `contact-${field}-error` : undefined;

  return (
    <form action={formAction} className="space-y-5">
      <fieldset>
        <legend className={LABEL}>What is this about?</legend>
        <div className="mt-2 flex gap-6">
          <label className="flex min-h-tap items-center gap-2 text-sm text-primary">
            <input type="radio" name="type" value="COMPLAINT" required />
            Complaint
          </label>
          <label className="flex min-h-tap items-center gap-2 text-sm text-primary">
            <input type="radio" name="type" value="ENQUIRY" required defaultChecked />
            Enquiry
          </label>
        </div>
        <FieldError state={state} field="type" />
      </fieldset>

      <div>
        <label htmlFor="contact-name" className={LABEL}>
          Your name
        </label>
        <input
          id="contact-name"
          name="name"
          required
          maxLength={CONTACT_LIMITS.name}
          defaultValue={defaultName}
          autoComplete="name"
          aria-describedby={describedBy("name")}
          className={INPUT}
        />
        <FieldError state={state} field="name" />
      </div>

      <div>
        <label htmlFor="contact-email" className={LABEL}>
          Your email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          maxLength={CONTACT_LIMITS.email}
          defaultValue={defaultEmail}
          autoComplete="email"
          aria-describedby={describedBy("email")}
          className={INPUT}
        />
        <FieldError state={state} field="email" />
      </div>

      <div>
        <label htmlFor="contact-phone" className={LABEL}>
          Phone (optional)
        </label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          maxLength={CONTACT_LIMITS.phone}
          autoComplete="tel"
          aria-describedby={describedBy("phone")}
          className={INPUT}
        />
        <FieldError state={state} field="phone" />
      </div>

      {orders.length > 0 && (
        <div>
          <label htmlFor="contact-order" className={LABEL}>
            Order (optional)
          </label>
          <select id="contact-order" name="orderId" defaultValue="" className={INPUT}>
            <option value="">Not about an order</option>
            {orders.map((o) => (
              <option key={o.orderNumber} value={o.orderNumber}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="contact-subject" className={LABEL}>
          Subject
        </label>
        <input
          id="contact-subject"
          name="subject"
          required
          maxLength={CONTACT_LIMITS.subject}
          aria-describedby={describedBy("subject")}
          className={INPUT}
        />
        <FieldError state={state} field="subject" />
      </div>

      <div>
        <label htmlFor="contact-message" className={LABEL}>
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={6}
          required
          minLength={CONTACT_LIMITS.messageMin}
          maxLength={CONTACT_LIMITS.messageMax}
          aria-describedby={describedBy("message")}
          className={INPUT}
        />
        <FieldError state={state} field="message" />
      </div>

      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-tap items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 lg:min-h-0"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
