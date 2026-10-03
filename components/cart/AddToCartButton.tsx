"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Check, Loader2, Minus } from "lucide-react";
import { addToCart } from "@/features/cart/add-to-cart";
import type { AddOutcome } from "@/lib/cart-rules";
import { useCartFeedback } from "./CartFeedback";
import { addFeedbackButtonText, addFeedbackMessage } from "./add-feedback-copy";

/** How long the button shows "Added" (unchanged) and any other outcome (#956). */
const ADDED_MS = 1500;
const OTHER_OUTCOME_MS = 4000;

/**
 * What the button itself shows after a click. Only the `drawer` and `full`
 * variants show an outcome other than "Added": on a card, the re-render after
 * an add swaps this button out (see `CartFeedback.tsx`), so the card relies on
 * the shared region instead.
 */
type Flash = { kind: "added" } | { kind: "other"; text: string } | null;

export function AddToCartButton({
  productId,
  productName,
  disabled = false,
  label = "Add to cart",
  variant = "icon",
}: {
  productId: string;
  /** #956 — names the controls and the outcome message. Required: never a placeholder. */
  productName: string;
  disabled?: boolean;
  label?: string;
  variant?: "icon" | "full" | "card" | "drawer";
}) {
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<Flash>(null);
  const [qty, setQty] = useState(1);
  const announce = useCartFeedback();
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  function showFlash(next: Exclude<Flash, null>, ms: number) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(next);
    flashTimer.current = setTimeout(() => setFlash(null), ms);
  }

  // #351/#656: this control is a sibling of ProductCard's stretched-link
  // title now, not a descendant of an <a> — see ProductCard.tsx's doc
  // comment. There is no ancestor anchor for a click here to reach any more,
  // so nothing needs swallowing on its way up; preventDefault() still guards
  // `type="button"` from any enclosing <form>'s default submit.
  function onClickAdd(e: React.MouseEvent) {
    e.preventDefault();
    if (disabled || pending) return;
    startTransition(async () => {
      // #956 — the server says what it actually did. A rejected call is caught
      // here (null) rather than thrown into the route error boundary.
      let outcome: AddOutcome | null;
      try {
        outcome = await addToCart(productId, qty);
      } catch {
        outcome = null;
      }
      announce(addFeedbackMessage(outcome, productName));
      if (outcome?.kind === "added") showFlash({ kind: "added" }, ADDED_MS);
      else showFlash({ kind: "other", text: addFeedbackButtonText(outcome) }, OTHER_OUTCOME_MS);
      setQty(1);
    });
  }

  function onClickMinus(e: React.MouseEvent) {
    e.preventDefault();
    if (qty > 1) setQty((q) => q - 1);
  }

  function onClickPlus(e: React.MouseEvent) {
    e.preventDefault();
    if (qty < 99) setQty((q) => q + 1);
  }

  const added = flash?.kind === "added";
  const outcomeText = flash?.kind === "other" ? flash.text : null;
  const Icon = pending ? Loader2 : added ? Check : Plus;

  if (variant === "card") {
    if (disabled) {
      return (
        <button
          type="button"
          disabled
          aria-label={`${productName} is out of stock`}
          className="flex w-full min-h-tap lg:min-h-0 items-center justify-center rounded-xl bg-surface-muted px-4 py-2 text-xs font-bold text-black/60 cursor-not-allowed"
        >
          Out of stock
        </button>
      );
    }

    // #961 — every control here is 44px (`tap`) below `lg`, today's 32px from `lg`. Below `sm` a
    // 2-column card has about 128px of content width, which cannot hold a 44px minus, a quantity,
    // a 44px plus AND the Add button, so the pre-add picker is hidden there: one tap adds one, and
    // ProductCard then swaps in CartQuantityStepper (#345), which carries its own 44px controls.
    return (
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="hidden sm:flex items-center rounded-xl border border-black/10 bg-surface-muted overflow-hidden lg:h-8">
          <button
            type="button"
            onClick={onClickMinus}
            aria-label={`Decrease quantity of ${productName}`}
            className="size-tap lg:w-auto lg:px-2 lg:h-full flex items-center justify-center text-black/70 hover:bg-black/5 hover:text-black transition-colors"
          >
            <Minus className="w-3 h-3" aria-hidden="true" />
          </button>
          <span className="text-xs font-semibold text-primary w-4 text-center">{qty}</span>
          <button
            type="button"
            onClick={onClickPlus}
            aria-label={`Increase quantity of ${productName}`}
            className="size-tap lg:w-auto lg:px-2 lg:h-full flex items-center justify-center text-black/70 hover:bg-black/5 hover:text-black transition-colors"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onClickAdd}
          disabled={pending}
          aria-label={label}
          className="flex-1 flex items-center justify-center gap-1.5 h-tap lg:h-8 rounded-xl bg-primary text-white text-xs font-bold transition hover:bg-primary/90 active:scale-95 motion-reduce:active:scale-100 shadow-sm"
        >
          <Icon className={`w-3.5 h-3.5 ${pending ? "animate-spin" : ""}`} />
          {added ? "Added" : "Add"}
        </button>
      </div>
    );
  }

  if (variant === "drawer") {
    if (disabled) {
      return (
        <button
          type="button"
          disabled
          aria-label={`${productName} is out of stock`}
          className="flex w-full items-center justify-center rounded-2xl bg-surface-muted px-4 py-3 text-sm font-bold text-black/60 cursor-not-allowed"
        >
          Out of stock
        </button>
      );
    }

    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-xl border border-black/10 bg-surface-muted overflow-hidden h-11">
          <button
            type="button"
            onClick={onClickMinus}
            aria-label={`Decrease quantity of ${productName}`}
            className="px-3 h-full flex items-center justify-center text-black/70 hover:bg-black/5 hover:text-black transition-colors"
          >
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="text-sm font-bold text-primary w-8 text-center">{qty}</span>
          <button
            type="button"
            onClick={onClickPlus}
            aria-label={`Increase quantity of ${productName}`}
            className="px-3 h-full flex items-center justify-center text-black/70 hover:bg-black/5 hover:text-black transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onClickAdd}
          disabled={pending}
          className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl bg-primary px-4 text-white text-sm font-bold transition hover:bg-primary/90 active:scale-95 motion-reduce:active:scale-100 shadow-sm"
        >
          <Icon className={`w-4 h-4 ${pending ? "animate-spin" : ""}`} />
          <span>{added ? "Added to cart" : (outcomeText ?? label)}</span>
        </button>
      </div>
    );
  }

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={onClickAdd}
        disabled={disabled || pending}
        aria-label={disabled ? `${productName} is out of stock` : label}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
        <span>{disabled ? "Out of stock" : added ? "Added" : (outcomeText ?? label)}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClickAdd}
      disabled={disabled || pending}
      aria-label={disabled ? "Out of stock" : label}
      className="flex items-center justify-center rounded-full bg-primary p-2 text-white transition active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
    </button>
  );
}
