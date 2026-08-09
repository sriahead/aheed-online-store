"use client";

import { useState, type ReactNode } from "react";
import { ShoppingBag, X } from "lucide-react";

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
 * Colours are semantic tokens (bg-primary, …) per specs/design-system.md's
 * mockup→token table — never the reference's #1B5E20 literals, which would
 * freeze every vendor to Aheed's green and undo per-vendor theming.
 */
export function CartDrawerShell({
  itemCount,
  children,
}: {
  itemCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={itemCount > 0 ? `Cart, ${itemCount} items` : "Cart, empty"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-bold text-white sm:px-3.5"
      >
        <ShoppingBag className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Cart</span>
        {itemCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
            {itemCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Shopping cart"
        >
          {/* Backdrop — click to dismiss */}
          <button
            type="button"
            aria-label="Close cart"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="flex w-screen max-w-md flex-col border-l border-black/10 bg-white shadow-2xl">
              <div className="flex items-center justify-between bg-primary p-4 text-white">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" aria-hidden />
                  <h2 className="text-base font-bold">My Cart ({itemCount})</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
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
