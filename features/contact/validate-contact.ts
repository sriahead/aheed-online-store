import type { ContactType } from "@/lib/contact/recipient";

/**
 * Pure validation for the storefront contact form (#1409 R11, R13).
 *
 * A PLAIN MODULE, NOT `"use server"`: a `"use server"` file may export only async functions, and
 * that rule is enforced at runtime only. The limits here are the ones the form's `maxLength`
 * attributes use, so the browser and the server refuse the same input.
 */

export const CONTACT_LIMITS = {
  name: 100,
  email: 254,
  phone: 30,
  subject: 150,
  messageMin: 10,
  messageMax: 5000,
} as const;

export const CONTACT_TYPES: readonly ContactType[] = ["COMPLAINT", "ENQUIRY"];

export type ContactField = "name" | "email" | "phone" | "type" | "subject" | "message" | "orderId";

export interface ContactFormState {
  status: "idle" | "error" | "success";
  /** A form-level message (rate limit, order not found, nowhere to send). */
  error: string | null;
  fieldErrors: Partial<Record<ContactField, string>>;
  /** On success, the address the store will reply to. */
  replyTo: string | null;
}

export const initialContactState: ContactFormState = {
  status: "idle",
  error: null,
  fieldErrors: {},
  replyTo: null,
};

export interface ContactSubmission {
  name: string;
  email: string;
  phone: string;
  type: ContactType;
  subject: string;
  message: string;
  /** The chosen order's number, or "" when the message is not about an order. */
  orderNumber: string;
}

export type ParsedContact =
  | { ok: true; value: ContactSubmission }
  | { ok: false; fieldErrors: Partial<Record<ContactField, string>> };

// The same shape the browser's type="email" accepts in practice: one @, no spaces, a dot after it.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads the submitted fields, trimmed. Missing fields read as "". */
export function readContactFields(get: (key: string) => unknown): Record<string, string> {
  const read = (key: string) => {
    const value = get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    name: read("name"),
    email: read("email"),
    phone: read("phone"),
    type: read("type"),
    subject: read("subject"),
    message: read("message"),
    orderId: read("orderId"),
    website: read("website"),
  };
}

export function parseContactFields(fields: Record<string, string>): ParsedContact {
  const errors: Partial<Record<ContactField, string>> = {};
  const { name, email, phone, type, subject, message, orderId } = fields;

  if (name === "") errors.name = "Enter your name.";
  else if (name.length > CONTACT_LIMITS.name)
    errors.name = `Use at most ${CONTACT_LIMITS.name} characters.`;

  if (email === "") errors.email = "Enter your email address.";
  else if (email.length > CONTACT_LIMITS.email || !EMAIL.test(email))
    errors.email = "Enter a valid email address.";

  if (phone.length > CONTACT_LIMITS.phone)
    errors.phone = `Use at most ${CONTACT_LIMITS.phone} characters.`;

  if (!(CONTACT_TYPES as readonly string[]).includes(type))
    errors.type = "Choose Complaint or Enquiry.";

  if (subject === "") errors.subject = "Enter a subject.";
  else if (subject.length > CONTACT_LIMITS.subject)
    errors.subject = `Use at most ${CONTACT_LIMITS.subject} characters.`;

  if (message.length < CONTACT_LIMITS.messageMin)
    errors.message = `Write at least ${CONTACT_LIMITS.messageMin} characters.`;
  else if (message.length > CONTACT_LIMITS.messageMax)
    errors.message = `Use at most ${CONTACT_LIMITS.messageMax} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      type: type as ContactType,
      subject,
      message,
      orderNumber: orderId,
    },
  };
}
