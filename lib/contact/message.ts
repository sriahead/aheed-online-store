import { escapeHtml } from "@/lib/html-escape";
import type { ContactType } from "./recipient";

/**
 * #1409 R17 — the subject and body of a storefront contact-form email. Pure, so the exact wording
 * is tested without a send. The subject is untagged: `getEmailService().send` adds [STAGING]/[DEV].
 * Every shopper-supplied value is HTML-escaped; the store name is escaped too, since it is vendor
 * data.
 */

export interface ContactMessageInput {
  storeName: string;
  type: ContactType;
  name: string;
  email: string;
  phone: string;
  orderNumber: string | null;
  subject: string;
  message: string;
  submittedAt: Date;
}

const TYPE_LABEL: Record<ContactType, string> = { COMPLAINT: "Complaint", ENQUIRY: "Enquiry" };

export function contactSubject(input: ContactMessageInput): string {
  return [
    TYPE_LABEL[input.type],
    input.storeName,
    input.orderNumber ? `Order ${input.orderNumber}` : null,
    input.subject,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

export function contactHtml(input: ContactMessageInput): string {
  const rows: [string, string][] = [
    ["Store", input.storeName],
    ["Type", TYPE_LABEL[input.type]],
    ["Name", input.name],
    ["Email", input.email],
    ["Phone", input.phone || "Not given"],
    ["Order", input.orderNumber ?? "None"],
    ["Subject", input.subject],
    ["Submitted", input.submittedAt.toISOString()],
  ];
  const table = rows
    .map(([label, value]) => `<tr><th align="left">${label}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const message = escapeHtml(input.message).replace(/\r?\n/g, "<br>");
  return `<p>A shopper sent this through the store's contact form. Reply to answer them directly.</p><table>${table}</table><p>${message}</p>`;
}

/**
 * #1552 R3 — the shopper's "we've received it" email. Fixed wording on purpose: the form accepts any
 * address, so nothing the submitter typed (name, subject, message) is echoed back, or the form would
 * relay a stranger's text to whoever they name. Only the store name and an order number the
 * repository already proved is the shopper's own appear.
 */
export function acknowledgementEmail(input: {
  storeName: string;
  type: ContactType;
  orderNumber: string | null;
}): { subject: string; html: string } {
  const noun = input.type === "COMPLAINT" ? "complaint" : "message";
  const store = escapeHtml(input.storeName);
  const paragraphs = [
    `<p><strong>Thanks for getting in touch with ${store}.</strong></p>`,
    `<p>We've received your ${noun}${
      input.orderNumber ? ` about order ${escapeHtml(input.orderNumber)}` : ""
    } and a member of our team will reply to this email address as soon as we can.</p>`,
    input.type === "COMPLAINT"
      ? `<p>We're sorry something wasn't right. We read every complaint and will do our best to put it right.</p>`
      : "",
    `<p>If you didn't contact ${store}, you can ignore this email.</p>`,
  ];
  return {
    subject: `We've received your ${noun} — ${input.storeName}`,
    html: paragraphs.filter(Boolean).join("\n"),
  };
}
