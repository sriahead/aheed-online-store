import type { ParseResult } from "@/lib/catalogue-form";

/**
 * Storefront footer contact & legal rules (#1055) — pure, DB-free, unit-tested.
 *
 * Same posture as `lib/social-contact-form.ts`: everything about what a submitted field MEANS lives
 * here, where a test reaches it without a database or a request. `features/admin/storefront.ts`
 * reads the form and calls the repository; nothing here knows either exists.
 *
 * ## Blank is a success
 *
 * `null` is meaningful for every field — it HIDES that footer element, with no platform fallback
 * (#239). Clearing a field is deliberate, so blank parses to `null`.
 *
 * ## Why a bracketed placeholder is accepted for phone and email
 *
 * The owner approved seeding placeholders such as `[YOUR EMAIL]` until the real values exist, and
 * an admin must be able to save the form with one still in place. Accepting it here is safe because
 * this validator never decides what becomes an `href`: the footer builds `tel:`/`mailto:` only from
 * a value that passes `isDiallablePhone`/`isEmailAddress` below, and renders anything else as text.
 */

export const CONTACT_PHONE_FIELD = "contactPhone";
export const CONTACT_EMAIL_FIELD = "contactEmail";
export const COMPANY_NUMBER_FIELD = "companyNumber";
export const VAT_NUMBER_FIELD = "vatNumber";
export const REGISTERED_OFFICE_FIELD = "registeredOffice";
export const OPENING_HOURS_NOTE_FIELD = "openingHoursNote";
export const SECURE_CHECKOUT_NOTE_FIELD = "showSecureCheckoutNote";

const PHONE_PATTERN = /^[+\d\s()-]{6,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const PLACEHOLDER_PATTERN = /^\[[^\]]+\]$/;

/** True when `value` is a phone number the footer may put in a `tel:` href. */
export function isDiallablePhone(value: string): boolean {
  return PHONE_PATTERN.test(value) && /\d/.test(value);
}

/** True when `value` is an address the footer may put in a `mailto:` href. */
export function isEmailAddress(value: string): boolean {
  return value.length <= EMAIL_MAX && EMAIL_PATTERN.test(value);
}

/** The `tel:` href for a diallable phone: digits only, keeping a leading `+`. */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${trimmed.replace(/\D/g, "")}`;
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value);
}

export interface FooterContactInput {
  contactPhone: string | null;
  contactEmail: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  registeredOffice: string | null;
  openingHoursNote: string | null;
  showSecureCheckoutNote: boolean;
}

/**
 * `useActionState` shape. Lives here rather than in the `"use server"` file, which may export ONLY
 * async functions (#159).
 */
export interface FooterContactFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

export const initialFooterContactState: FooterContactFormState = {
  error: null,
  field: null,
  saved: false,
};

function maxLength(
  raw: string,
  field: string,
  label: string,
  max: number,
): ParseResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > max) {
    return { ok: false, error: { field, message: `${label} must be ${max} characters or fewer.` } };
  }
  return { ok: true, value: trimmed };
}

export function parseContactPhone(raw: string): ParseResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (isPlaceholder(trimmed) || isDiallablePhone(trimmed)) return { ok: true, value: trimmed };
  return {
    ok: false,
    error: {
      field: CONTACT_PHONE_FIELD,
      message: "Enter a phone number using digits, spaces, + ( ) or - only (6 to 20 characters).",
    },
  };
}

export function parseContactEmail(raw: string): ParseResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (isPlaceholder(trimmed) || isEmailAddress(trimmed)) return { ok: true, value: trimmed };
  return {
    ok: false,
    error: {
      field: CONTACT_EMAIL_FIELD,
      message: "Enter a full email address, e.g. name@example.com.",
    },
  };
}

/** All seven at once. The first failing field wins, so the form points at one input at a time. */
export function parseFooterContact(raw: {
  contactPhone: string;
  contactEmail: string;
  companyNumber: string;
  vatNumber: string;
  registeredOffice: string;
  openingHoursNote: string;
  showSecureCheckoutNote: string | null;
}): ParseResult<FooterContactInput> {
  const phone = parseContactPhone(raw.contactPhone);
  if (!phone.ok) return phone;
  const email = parseContactEmail(raw.contactEmail);
  if (!email.ok) return email;
  const company = maxLength(raw.companyNumber, COMPANY_NUMBER_FIELD, "Company number", 20);
  if (!company.ok) return company;
  const vat = maxLength(raw.vatNumber, VAT_NUMBER_FIELD, "VAT number", 20);
  if (!vat.ok) return vat;
  const office = maxLength(raw.registeredOffice, REGISTERED_OFFICE_FIELD, "Registered office", 200);
  if (!office.ok) return office;
  const note = maxLength(raw.openingHoursNote, OPENING_HOURS_NOTE_FIELD, "Opening hours note", 200);
  if (!note.ok) return note;

  return {
    ok: true,
    value: {
      contactPhone: phone.value,
      contactEmail: email.value,
      companyNumber: company.value,
      vatNumber: vat.value,
      registeredOffice: office.value,
      openingHoursNote: note.value,
      showSecureCheckoutNote: raw.showSecureCheckoutNote === "on",
    },
  };
}
