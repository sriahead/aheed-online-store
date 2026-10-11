/**
 * The help assistant's WhatsApp handoff (#1015) — pure, unit-tested.
 *
 * A HANDOFF, NOT A TRANSFER. The conversation stays here; a short summary starts a new message in
 * the shopper's own WhatsApp, which they can read and edit before sending. Nothing is sent by this
 * platform.
 *
 * NO PERSONAL DATA. `buildHandoffText` takes exactly three things — the store's name, the subject
 * (a fixed topic label or the store's own FAQ question) and an optional order number — so there is
 * no parameter through which a shopper's name, email, phone or address could reach the URL, which
 * lands in browser history. The order number is the one identifier #1015 allows: it is what the
 * store needs, and on its own it does not open an order (guest lookup also needs the email).
 *
 * BOUNDED. `?text=` passes through the shopper's OS and browser, and some clients truncate long
 * prefilled text silently, so the text is capped at `HANDOFF_TEXT_MAX` characters after assembly.
 */

export const HANDOFF_TEXT_MAX = 300;

/** Shown beside the handoff link: it starts a message, and the conversation does not move. */
export const HANDOFF_NOTE =
  "This opens WhatsApp with a short summary. Your conversation here is not sent.";
const VENDOR_NAME_MAX = 60;
/** Real order numbers are about twenty characters; this only stops an absurd one breaking the cap. */
const ORDER_NUMBER_MAX = 40;

export interface HandoffTextInput {
  vendorName: string;
  subject: string;
  orderNumber?: string;
}

function compose(vendorName: string, subject: string, orderSentence: string): string {
  return `Hi ${vendorName}, I have a question about: ${subject}.${orderSentence}`;
}

export function buildHandoffText({ vendorName, subject, orderNumber }: HandoffTextInput): string {
  const orderSentence = orderNumber
    ? ` Order number: ${orderNumber.slice(0, ORDER_NUMBER_MAX)}.`
    : "";

  let name = vendorName;
  let text = compose(name, subject, orderSentence);
  if (text.length <= HANDOFF_TEXT_MAX) return text;

  // Shorten the store's name first: the subject is what the store needs to read.
  name = name.slice(0, VENDOR_NAME_MAX);
  text = compose(name, subject, orderSentence);
  if (text.length <= HANDOFF_TEXT_MAX) return text;

  // Then the subject, ending in an ellipsis. The order-number sentence is never cut.
  const room = HANDOFF_TEXT_MAX - compose(name, "", orderSentence).length;
  return compose(name, `${subject.slice(0, Math.max(0, room - 1))}…`, orderSentence);
}

export function buildHandoffUrl(whatsappNumber: string, text: string): string {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
}
