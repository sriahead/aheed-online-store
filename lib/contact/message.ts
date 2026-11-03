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
