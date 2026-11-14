import type { EmailBrand } from "@/lib/email/layout/brand";
import type { EmailBlock } from "@/lib/email/layout/render";
import { finish, orNull, templateCopy, type CopyOverrides, type RenderedEmail } from "./compose";

/**
 * #1564 — a staff reply from Enquiries & Inbox. The reply is the staff member's own words, shown
 * as written; the subject stays `Re: <their subject>` so mail clients thread it; the customer's
 * original message is quoted beneath. Only the reassurance line and sign-off are template wording.
 */
export function enquiryReplyEmail(input: {
  brand: EmailBrand;
  storeName: string;
  originalSubject: string;
  replyText: string;
  originalMessage: string;
  orderNumber: string | null;
  overrides?: CopyOverrides | null;
}): RenderedEmail {
  const { copy, reason } = templateCopy(
    "enquiry.reply",
    { storeName: input.storeName },
    input.overrides,
  );
  const subject = input.originalSubject.toLowerCase().startsWith("re:")
    ? input.originalSubject
    : `Re: ${input.originalSubject}`;
  const blocks: EmailBlock[] = [];
  if (input.orderNumber) {
    blocks.push({ kind: "facts", rows: [{ label: "Order number", value: input.orderNumber }] });
  }
  blocks.push({ kind: "message", text: input.replyText });
  blocks.push({ kind: "quote", caption: "Your original message", text: input.originalMessage });

  const preview = input.replyText.replace(/\s+/g, " ").trim();
  return finish(
    subject,
    {
      preheader: preview.length > 110 ? `${preview.slice(0, 107)}…` : preview,
      heading: copy.heading,
      blocks,
      reassurance: orNull(copy.reassurance),
      signOff: orNull(copy.signOff),
      reason,
    },
    input.brand,
  );
}
