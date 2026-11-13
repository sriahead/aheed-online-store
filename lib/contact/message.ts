import type { EmailBrand } from "@/lib/email/layout/brand";
import { fallbackBrand } from "@/lib/email/layout/fallback";
import { renderEmail } from "@/lib/email/layout/render";
import {
  finish,
  orNull,
  templateCopy,
  type CopyOverrides,
  type RenderedEmail,
} from "@/lib/email/templates/compose";
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

/**
 * The message the store's mailbox receives. #1564 R15: in the shared layout with the store's header
 * and footer. Everything the shopper typed is escaped by the layout; the message keeps its lines.
 */
export function contactHtml(input: ContactMessageInput, brand?: EmailBrand): string {
  const label = TYPE_LABEL[input.type];
  return renderEmail(
    {
      preheader: `${label} from ${input.name}: ${input.subject}`,
      heading: `${label} from the contact form`,
      intro:
        "A shopper sent this through your store's contact form. Reply to this email to answer them directly.",
      blocks: [
        {
          kind: "facts",
          rows: [
            { label: "Name", value: input.name },
            { label: "Email", value: input.email },
            { label: "Phone", value: input.phone || "Not given" },
            { label: "Order", value: input.orderNumber ?? "None" },
            { label: "Subject", value: input.subject },
            { label: "Submitted", value: input.submittedAt.toISOString() },
          ],
        },
        { kind: "message", text: input.message },
      ],
      reason: `A message for the ${input.storeName} team from your store's Contact us form.`,
    },
    brand ?? fallbackBrand(input.storeName),
  ).html;
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
  /** #1564 — the store's look; neutral when absent. */
  brand?: EmailBrand;
  overrides?: CopyOverrides | null;
}): RenderedEmail {
  const brand = input.brand ?? fallbackBrand(input.storeName);
  const { copy, reason } = templateCopy(
    input.type === "COMPLAINT" ? "contact.complaint_acknowledgement" : "contact.acknowledgement",
    { storeName: input.storeName },
    input.overrides,
  );
  return finish(
    copy.subject,
    {
      preheader: copy.preheader,
      heading: copy.heading,
      intro: orNull(copy.intro),
      blocks: input.orderNumber
        ? [{ kind: "facts", rows: [{ label: "Order number", value: input.orderNumber }] }]
        : [],
      reassurance: orNull(copy.reassurance),
      signOff: orNull(copy.signOff),
      reason,
    },
    brand,
  );
}
