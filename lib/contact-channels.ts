/**
 * The vendor's shopper-facing contact channels (#1060) — pure, DB-free, unit-tested.
 *
 * The ONE source for which channels exist, in what order, with which link and label. Both
 * `FloatingContact` (the floating disclosure) and the storefront footer's channel row render this
 * list, so the two can never disagree about which channels a vendor offers.
 *
 * The rules are the ones `FloatingContact` carried inline before #1060:
 * - a channel appears only when its value is set — no platform fallback (#239);
 * - with the help assistant available, WhatsApp is reached through the assistant's handoff, not
 *   directly (#1051);
 * - the assistant appears only when available (`assistantEnabled` and a WhatsApp number, #1015).
 *
 * Order is how a shopper reads the open floating panel top to bottom: facebook, instagram, whatsapp,
 * assistant (the one nearest the trigger).
 */

export type ContactChannelKind = "facebook" | "instagram" | "whatsapp" | "assistant";

export interface ContactChannel {
  kind: ContactChannelKind;
  /** `null` for the assistant, which opens a dialog rather than navigating. */
  href: string | null;
  label: string;
}

export interface ContactChannelsInput {
  vendorName: string;
  facebookUrl: string | null;
  instagramUrl: string | null;
  whatsappNumber: string | null;
  assistantAvailable: boolean;
}

export function contactChannels(input: ContactChannelsInput): ContactChannel[] {
  const { vendorName, facebookUrl, instagramUrl, whatsappNumber, assistantAvailable } = input;
  const channels: ContactChannel[] = [];

  if (facebookUrl) {
    channels.push({ kind: "facebook", href: facebookUrl, label: `${vendorName} on Facebook` });
  }
  if (instagramUrl) {
    channels.push({ kind: "instagram", href: instagramUrl, label: `${vendorName} on Instagram` });
  }
  if (whatsappNumber && !assistantAvailable) {
    const message = `Hi ${vendorName}, I have a question about my order.`;
    channels.push({
      kind: "whatsapp",
      href: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`,
      label: `Message ${vendorName} on WhatsApp`,
    });
  }
  if (assistantAvailable) {
    channels.push({ kind: "assistant", href: null, label: "Open help assistant" });
  }

  return channels;
}
