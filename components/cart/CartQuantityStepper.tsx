"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { updateQuantity } from "@/features/cart/update-quantity";
import { clampQuantity } from "@/lib/cart-rules";
import { createQuantityCoalescer, type QuantityCoalescer } from "./quantity-coalescer";

/**
 * P8.5a (#345) — the product grid's cart-mutating quantity stepper.
 *
 * Distinct from `AddToCartButton`'s `variant="card"` control, which picks a
 * quantity BEFORE adding. This one reflects what is already in the cart and
 * changes it: the card renders `AddToCartButton` when the product is not in the
 * cart, and this when it is.
 *
 * Writes are coalesced — see `quantity-coalescer.ts` for why that is a
 * requirement (R8) rather than a refinement. The displayed number updates
 * immediately so the control feels direct; the server sees one call carrying
 * the final quantity.
 *
 * On failure the display reverts to the last server-confirmed value (R10)
 * rather than stranding an optimistic number the cart does not actually hold.
 *
 * The buttons stop propagation because the whole card is a `<Link>` — the same
 * approach `AddToCartButton` already takes. Handling it per-button rather than
 * on a wrapping div is deliberate: a div with a click handler is a
 * `jsx-a11y/no-static-element-interactions` error, and the buttons are the only
 * things that actually need to swallow the click.
 */

/**
 * Idle window before a burst flushes. Long enough that a human tapping "+"
 * three or four times lands one write, short enough that the cart total the
 * shopper sees next is not visibly stale.
 */
const COALESCE_MS = 600;

export function CartQuantityStepper({
  productId,
  quantity: serverQuantity,
  stock,
  productName,
}: {
  productId: string;
  /** Quantity currently in the cart, from the server render. */
  quantity: number;
  /** Available stock, so "+" cannot exceed it. */
  stock: number;
  /** Used for the controls' accessible names. */
  productName: string;
}) {
  const [displayed, setDisplayed] = useState(serverQuantity);
  const [failed, setFailed] = useState(false);

  // A server render (after revalidation) is authoritative: adopt it and drop
  // any optimistic value.
  //
  // Done DURING RENDER, not in an effect. This is React's documented "adjusting
  // state when a prop changes" pattern — an effect calling setState here would
  // cascade an extra render for every cart write, and would trip
  // `react-hooks/set-state-in-effect`. Suppressing that rule was the other
  // option and is the worse one: the rule is right, and CLAUDE.md's React
  // section only sanctions silencing it when the dependency semantics are the
  // thing at stake, which they are not here.
  const [lastServerQuantity, setLastServerQuantity] = useState(serverQuantity);
  if (serverQuantity !== lastServerQuantity) {
    setLastServerQuantity(serverQuantity);
    setDisplayed(serverQuantity);
    setFailed(false);
  }

  // The value to fall back to when a flush rejects (R10). Mirrors the server
  // render, not the optimistic state. Written in an effect rather than during
  // render — `react-hooks/refs` rightly rejects reading a ref from a callback
  // built during render.
  const confirmed = useRef(serverQuantity);
  useEffect(() => {
    confirmed.current = serverQuantity;
  }, [serverQuantity]);

  const coalescer = useRef<QuantityCoalescer | null>(null);
  useEffect(() => {
    const pendingWrites = createQuantityCoalescer({
      delayMs: COALESCE_MS,
      flush: (next) => updateQuantity(productId, next),
      onError: () => {
        setDisplayed(confirmed.current);
        setFailed(true);
      },
    });
    coalescer.current = pendingWrites;
    return () => {
      // Flush rather than cancel: if the card unmounts mid-burst (navigation,
      // a filter change) the click the shopper just made must still land.
      pendingWrites.flushNow();
      coalescer.current = null;
    };
  }, [productId]);

  function step(event: React.MouseEvent, delta: 1 | -1) {
    // The card is a link; a stepper click must not navigate.
    event.preventDefault();
    event.stopPropagation();

    // Decrementing past 1 means removal, which clampQuantity deliberately
    // refuses to express (it never lands on 0 by decrement), so it is handled
    // here.
    const next = displayed + delta <= 0 ? 0 : clampQuantity(displayed, delta, stock);
    if (next === displayed) return;
    setFailed(false);
    setDisplayed(next);
    coalescer.current?.set(next);
  }

  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-action-tint p-1">
      <button
        type="button"
        onClick={(event) => step(event, -1)}
        aria-label={
          displayed <= 1 ? `Remove ${productName} from cart` : `Decrease quantity of ${productName}`
        }
        className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-primary transition-colors hover:bg-surface-muted"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>

      <span
        className="min-w-[1.25rem] px-1 text-center text-xs font-bold text-primary"
        aria-live="polite"
        aria-label={`${displayed} ${productName} in cart`}
      >
        {displayed}
      </span>

      <button
        type="button"
        onClick={(event) => step(event, 1)}
        disabled={displayed >= stock}
        aria-label={`Increase quantity of ${productName}`}
        className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>

      {failed && (
        <span role="status" className="pl-1 text-[10px] font-semibold text-danger">
          Not saved
        </span>
      )}
    </div>
  );
}
