"use client";

import { useState } from "react";
import { MessageCircle, Share2, X } from "lucide-react";

/**
 * Floating per-vendor contact cluster (P9.2, #407 / #405).
 *
 * One always-visible trigger that expands to reveal whichever of WhatsApp, Instagram and Facebook
 * that vendor has configured. Each link renders only when its value is non-null; a `null` HIDES it
 * rather than falling back to a platform account (#239). A vendor with nothing configured renders
 * no trigger at all — an empty disclosure would advertise links that do not exist.
 *
 * ## Why a disclosure rather than three floating buttons
 *
 * Three permanently-visible controls stacked above the cart button occupied a real share of a phone
 * viewport, and grew taller with every link a vendor added. Collapsing them behind one trigger keeps
 * the footprint fixed at a single button no matter how many links exist.
 *
 * **The links are closed by default and open ONLY on click.** Nothing about scrolling, hovering or
 * focusing opens them: a control that expands because the reader happened to scroll past is exactly
 * the pattern this replaced. The earlier revision hid and revealed the whole cluster on scroll
 * direction, and that behaviour is deliberately gone rather than layered underneath this one.
 *
 * ## Layout
 *
 * The trigger is the fixed anchor and the links are absolutely positioned ABOVE it, so a collapsed
 * panel occupies no layout space and the trigger never moves as it opens. The anchor sits above
 * `components/cart/CartDrawerShell.tsx`'s floating cart button, which occupies `bottom-6 right-6`
 * (`sm:bottom-8 sm:right-8`) and is unconditional — only its item-count badge is conditional, so it
 * is present on every storefront page including an empty cart.
 *
 * ## Accessibility
 *
 * A standard disclosure: `aria-expanded` on the trigger, `aria-controls` naming the panel, and an
 * accessible name that changes with state. The panel is not removed from the DOM while collapsed —
 * `pointer-events-none` plus `opacity-0` keeps it inert without the layout thrash of unmounting,
 * and `aria-hidden` keeps it out of the accessibility tree so a screen reader does not announce
 * links the sighted reader cannot see.
 */

const LINK_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-full bg-action text-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-transform hover:scale-105 motion-reduce:hover:scale-100 hover:bg-action-hover";

const PANEL_ID = "vendor-social-links";

function FacebookGlyph() {
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

function InstagramGlyph() {
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

export function FloatingContact({
  vendorName,
  facebookUrl,
  instagramUrl,
  whatsappNumber,
}: {
  vendorName: string;
  facebookUrl: string | null;
  instagramUrl: string | null;
  whatsappNumber: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!facebookUrl && !instagramUrl && !whatsappNumber) return null;

  const whatsappMessage = `Hi ${vendorName}, I have a question about my order.`;

  return (
    <div className="fixed bottom-24 right-6 z-50 sm:bottom-28 sm:right-8">
      <div className="relative">
        {/* Absolutely positioned so a collapsed panel takes no layout space and the
            trigger below never shifts as it opens. */}
        <div
          id={PANEL_ID}
          aria-hidden={!open}
          className={`absolute bottom-full right-0 mb-3 flex flex-col-reverse items-end gap-3 transition-all duration-200 ease-out motion-reduce:transition-none ${
            open
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0"
          }`}
        >
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Message ${vendorName} on WhatsApp`}
              tabIndex={open ? undefined : -1}
              className={LINK_CLASS}
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${vendorName} on Instagram`}
              tabIndex={open ? undefined : -1}
              className={LINK_CLASS}
            >
              <InstagramGlyph />
            </a>
          )}
          {facebookUrl && (
            <a
              href={facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${vendorName} on Facebook`}
              tabIndex={open ? undefined : -1}
              className={LINK_CLASS}
            >
              <FacebookGlyph />
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          aria-controls={PANEL_ID}
          aria-label={open ? "Hide contact links" : `Contact and follow ${vendorName}`}
          title={open ? "Hide contact links" : `Contact and follow ${vendorName}`}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-action text-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-transform hover:scale-105 motion-reduce:hover:scale-100 hover:bg-action-hover"
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Share2 className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
