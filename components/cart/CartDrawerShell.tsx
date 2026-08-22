"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ShoppingBag, X } from "lucide-react";

/** Everything focusable we expect inside the drawer, in DOM order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Open/close shell for the cart drawer (P3a, #93), following
 * docs/ui-ref/src/components/CartDrawer.tsx's structure — right-side slide-out,
 * `max-w-md`, backdrop dismiss, header count.
 *
 * Only the open/closed state is client-side. The drawer's CONTENTS are passed in
 * as server-rendered children, so cart data is still fetched on the server and
 * the quantity/remove controls stay progressively-enhanced <form> posts. That
 * keeps the storefront's near-zero-client-JS posture from P2.5b2.
 *
 * P7 closeout (#251/#217) added the keyboard half of the dialog contract. The
 * ARIA half was already here; what was missing is what a mouse never reveals:
 * focus stayed on the page behind the overlay, Tab walked out of the drawer into
 * content the backdrop was covering, Escape did nothing, and on close focus was
 * lost to the document body instead of returning to the cart button. See
 * specs/design-system.md's "Modal surfaces" rule.
 */
export function CartDrawerShell({
  itemCount,
  subtotalPence,
  children,
}: {
  itemCount: number;
  subtotalPence?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const close = useCallback(() => setOpen(false), []);
  const pathname = usePathname();

  // Close the drawer automatically when navigating to another page (like /checkout or /cart)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    close();
  }, [pathname, close]);

  // Move focus into the drawer on open, and hand it back to the cart button on
  // close. Restoring to openerRef rather than to whatever was focused before is
  // deliberate: the opener is the only thing that can have opened this, and it
  // is always still in the document, whereas a remembered node may have been
  // replaced when the server re-rendered the cart contents.
  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();
    return () => opener?.focus();
  }, [open]);

  // Escape and the Tab trap live on `document` rather than on a JSX onKeyDown.
  // Two reasons, one of them not obvious: a handler on the dialog container only
  // fires while focus is inside it, so anything that moved focus out would also
  // take Escape away — exactly when a user most needs it. (It also avoids
  // assigning key handlers to a non-interactive element, which jsx-a11y flags.)
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab") return;

      // Re-query on every Tab: the contents are server-rendered children and
      // can change under us between keystrokes.
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const insidePanel = active instanceof Node && panelRef.current?.contains(active);

      if (event.shiftKey && (active === first || !insidePanel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !insidePanel)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={itemCount > 0 ? `Cart, ${itemCount} items` : "Cart, empty"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full bg-primary px-4 py-3 text-sm font-bold text-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-transform hover:scale-105 hover:bg-primary/90 hover:shadow-[0_8px_30px_rgb(0,0,0,0.3)] sm:bottom-8 sm:right-8 group"
      >
        <ShoppingBag className="h-5 w-5" aria-hidden />
        {itemCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-extrabold text-white shadow-sm">
            {itemCount}
          </span>
        )}
        {(subtotalPence ?? 0) > 0 && (
          <span className="font-extrabold border-l border-white/30 pl-3 ml-1">
            £{(subtotalPence! / 100).toFixed(2)}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          {/*
            Backdrop — click to dismiss. A real <button> rather than a div with
            an onClick so it is natively interactive, but aria-hidden and out of
            the tab order: announcing a second "Close cart" the keyboard can
            reach adds nothing over the header's close button and Escape.
          */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={close}
          />

          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div
              ref={panelRef}
              className="flex w-screen max-w-md flex-col border-l border-black/10 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between bg-primary p-4 text-white">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" aria-hidden />
                  <h2 id={titleId} className="text-base font-bold">
                    My Cart ({itemCount})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close cart"
                  className="rounded-full p-1.5 text-white transition-colors hover:bg-black/15"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
