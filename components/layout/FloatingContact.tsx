"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

/**
 * Floating per-vendor contact cluster (P9.2, #407 / #405).
 *
 * All three controls — WhatsApp, Instagram, Facebook — float together above the cart button and
 * slide away as the reader scrolls down, returning on the way back up. Each renders only when that
 * vendor has stored a value; a `null` HIDES it rather than falling back to a platform account
 * (#239). A vendor with nothing configured renders no container at all.
 *
 * ## Layout
 *
 * ONE fixed container rather than three absolutely-positioned buttons: `flex-col-reverse` makes the
 * stack grow upward from a single anchor, so adding or removing a link needs no per-button
 * arithmetic and no button can collide with another. The anchor sits above
 * `components/cart/CartDrawerShell.tsx`'s floating cart button, which occupies `bottom-6 right-6`
 * (`sm:bottom-8 sm:right-8`) and is unconditional — only its item-count badge is conditional, so it
 * is present on every storefront page including an empty cart.
 *
 * ## Scroll behaviour, and why it does not unmount
 *
 * Hidden means translated and transparent, never removed from the DOM. Unmounting would drop
 * keyboard focus mid-interaction, and an element that vanishes from the accessibility tree on
 * scroll is worse than one that is merely off-screen. `focus-within` restores the whole cluster the
 * moment any control inside it receives focus, so a keyboard user tabbing to these never chases a
 * moving target. `pointer-events-none` while hidden stops an invisible control from swallowing a
 * click meant for the page.
 *
 * The scroll listener deliberately has an EMPTY dependency array and tracks the previous offset in
 * a ref. Putting `hidden` in the dependencies would tear down and re-add the listener on every
 * toggle — the same shape as the cart-drawer bug in `CLAUDE.md`'s React section, where including
 * the state a handler sets in its own dependency list made the effect fight itself.
 */

/** Ignore sub-pixel and momentum jitter; only a deliberate scroll should move the cluster. */
const SCROLL_DELTA = 12;

/** Above this offset the cluster is always shown — near the top of a page nothing should be hidden. */
const ALWAYS_VISIBLE_ABOVE = 120;

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

const BUTTON_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-full bg-action text-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-transform hover:scale-105 motion-reduce:hover:scale-100 hover:bg-action-hover";

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
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;

    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (Math.abs(delta) < SCROLL_DELTA) return;
      lastY.current = y;
      setHidden(y > ALWAYS_VISIBLE_ABOVE && delta > 0);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // `hidden` is deliberately absent — see the note above.
  }, []);

  if (!facebookUrl && !instagramUrl && !whatsappNumber) return null;

  const whatsappMessage = `Hi ${vendorName}, I have a question about my order.`;

  return (
    <div
      className={`fixed bottom-24 right-6 z-50 flex flex-col-reverse gap-3 transition-all duration-300 motion-reduce:transition-none sm:bottom-28 sm:right-8 ${
        hidden
          ? "pointer-events-none translate-x-20 opacity-0 focus-within:pointer-events-auto focus-within:translate-x-0 focus-within:opacity-100"
          : "translate-x-0 opacity-100"
      }`}
    >
      {whatsappNumber && (
        <a
          href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Message ${vendorName} on WhatsApp`}
          className={BUTTON_CLASS}
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
          className={BUTTON_CLASS}
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
          className={BUTTON_CLASS}
        >
          <FacebookGlyph />
        </a>
      )}
    </div>
  );
}
