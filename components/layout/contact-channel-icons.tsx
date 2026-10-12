import { HelpCircle, MessageCircle } from "lucide-react";
import type { ContactChannelKind } from "@/lib/contact-channels";

/**
 * The one icon per contact channel (#1060), shared by `FloatingContact` and the storefront footer's
 * channel row so both always show the same glyph for the same channel. Decorative: the control
 * carrying the icon owns the accessible name.
 */

export function FacebookGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export function InstagramGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function ContactChannelIcon({ kind }: { kind: ContactChannelKind }) {
  switch (kind) {
    case "facebook":
      return <FacebookGlyph />;
    case "instagram":
      return <InstagramGlyph />;
    case "whatsapp":
      return <MessageCircle className="h-5 w-5" aria-hidden="true" />;
    case "assistant":
      return <HelpCircle className="h-5 w-5" aria-hidden="true" />;
  }
}
