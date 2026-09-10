import { MessageCircle } from "lucide-react";

/**
 * Floating WhatsApp deep link (P9.2, #405 — the small half; the chat re-order half is #695).
 *
 * A plain `wa.me` link with a prefilled message: no API, no Meta Business account, no inbound
 * webhook, and no client JavaScript. It renders only when the vendor has stored a number — a
 * `null` hides it rather than falling back to a platform number (#239).
 *
 * ## Position
 *
 * `components/cart/CartDrawerShell.tsx` already occupies `bottom-6 right-6` (`sm:bottom-8
 * sm:right-8`) with the floating cart button, and that button is UNCONDITIONAL — only its
 * item-count badge is conditional, so it is present on every storefront page including an empty
 * cart. This control therefore stacks above it rather than taking the bottom-right corner where a
 * WhatsApp button conventionally sits. `components/consent/CookieBanner.tsx` is the other fixed
 * element (`bottom-0`, full width), and it is dismissible and transient.
 *
 * `#405` also warns about colliding with "the sticky bottom nav". There is no sticky bottom nav in
 * this repo — `CollectionNav` is a collections strip and `PanelNav` is staff-only — so that half of
 * the constraint is stale.
 *
 * ## Colour
 *
 * Deliberately NOT WhatsApp's brand green. A hex literal would break this repo's design-token
 * convention, and a per-vendor storefront rendering a third party's brand colour in its own chrome
 * is the same category of mistake #239 fixed. It uses `bg-action`, so it renders in Aheed's green
 * and SriMart's blue.
 */
export function WhatsAppLink({
  vendorName,
  whatsappNumber,
}: {
  vendorName: string;
  whatsappNumber: string | null;
}) {
  if (!whatsappNumber) return null;

  const message = `Hi ${vendorName}, I have a question about my order.`;
  const href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Message ${vendorName} on WhatsApp`}
      className="fixed bottom-24 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-action text-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-transform hover:scale-105 motion-reduce:hover:scale-100 hover:bg-action-hover hover:shadow-[0_8px_30px_rgb(0,0,0,0.3)] sm:bottom-28 sm:right-8"
    >
      <MessageCircle className="h-6 w-6" aria-hidden="true" />
    </a>
  );
}
