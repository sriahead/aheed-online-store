"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { addToCart } from "@/features/cart/add-to-cart";
import type { AddOutcome } from "@/lib/cart-rules";
import type { IconName } from "@/components/icons/registry";
import { useCartFeedback } from "./CartFeedback";
import { addFeedbackButtonText, addFeedbackMessage } from "./add-feedback-copy";
import { CUSTOM_NOTE_MAX_LENGTH } from "@/lib/custom-note";
import { Icon } from "@/components/icons/Icon";

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
  acceptsNote = false,
}: {
  productId: string;
  /** #956 — names the controls and the outcome message. Required: never a placeholder. */
  productName: string;
  disabled?: boolean;
  label?: string;
  variant?: "icon" | "full" | "card" | "drawer";
  /**
   * #1135 — the product takes a shopper note (`productAcceptsNote`). Only the `full` variant (the
   * product page) renders the note box; cards and Quick View never do.
   */
  acceptsNote?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<Flash>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const noteId = useId();
  const showNote = variant === "full" && acceptsNote && !disabled;
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
        outcome = await addToCart(productId, qty, showNote && note.trim() ? note : null);
      } catch {
        outcome = null;
      }
      announce(addFeedbackMessage(outcome, productName));
      if (outcome?.kind === "added") {
        showFlash({ kind: "added" }, ADDED_MS);
        // #1135 — the note now lives on the basket line, where it can be edited.
        setNote("");
      } else showFlash({ kind: "other", text: addFeedbackButtonText(outcome) }, OTHER_OUTCOME_MS);
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
  const iconName: IconName = pending ? "loader-circle" : added ? "check" : "plus";

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

    // #1185 — ONE CONTROL: a bare `+` that adds one. No "Add" text and no pre-add quantity picker.
    //
    // This REVERSES #956's Gate 1 decision ("pre-add quantity picker: unchanged, by owner
    // decision"), re-approved by the owner on 2026-10-20. Do not restore it as a regression. Two
    // facts made it cheap: #961 already hid the picker below `sm`, because a 2-column card at 360px
    // has roughly 128px of content width and cannot hold a 44px minus, a readout, a 44px plus AND
    // the Add button — so most phone shoppers never saw it. And a successful add on a card never
    // showed "Added" anyway: `addToCart` revalidates, the listing re-renders with the product's new
    // `cartQuantity`, and ProductCard swaps this button for `CartQuantityStepper` (#345) before any
    // flash can be read. That is why the shared `CartFeedback` region exists, and it remains the
    // card's only channel for `partial`, `AT_STOCK_LIMIT` and `SOLD_OUT`.
    //
    // `label` IS THE ACCESSIBLE NAME, not decoration. #956 fixed "the card variant ignores its
    // `label` prop, so every card's button is named Add"; with no text left, dropping it would
    // re-create that exact regression in a worse form — an unnamed icon button.
    //
    // 44px (`tap`) below `lg`, 32px from `lg`, matching the stepper it is swapped for so the card
    // does not change height on the first add.
    return (
      <div className="flex items-center justify-end mt-1">
        <button
          type="button"
          onClick={onClickAdd}
          disabled={pending}
          aria-label={label}
          className="flex size-tap lg:size-8 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary/90 active:scale-95 motion-reduce:active:scale-100 shadow-sm"
        >
          <Icon name={iconName} className={`w-4 h-4 ${pending ? "animate-spin" : ""}`} />
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

    // #979 — below `lg`, minus and plus are 44px (`tap`) each way. The stepper's 1px border made
    // them 42px tall inside the old fixed `h-11`, so the row now takes its height from them (46px)
    // and Add stretches to match. From `lg`, everything is the old 44px row.
    return (
      <div data-tap-surface="quick-view-add" className="flex items-center gap-3">
        <div className="flex items-center rounded-xl border border-black/10 bg-surface-muted overflow-hidden lg:h-11">
          <button
            type="button"
            onClick={onClickMinus}
            aria-label={`Decrease quantity of ${productName}`}
            className="min-h-tap min-w-tap lg:min-h-0 lg:min-w-0 px-3 h-full flex items-center justify-center text-black/70 hover:bg-black/5 hover:text-black transition-colors"
          >
            <Icon name="minus" className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-primary w-8 text-center">{qty}</span>
          <button
            type="button"
            onClick={onClickPlus}
            aria-label={`Increase quantity of ${productName}`}
            className="min-h-tap min-w-tap lg:min-h-0 lg:min-w-0 px-3 h-full flex items-center justify-center text-black/70 hover:bg-black/5 hover:text-black transition-colors"
          >
            <Icon name="plus" className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onClickAdd}
          disabled={pending}
          className="flex-1 flex items-center justify-center gap-2 self-stretch lg:self-auto lg:h-11 rounded-2xl bg-primary px-4 text-white text-sm font-bold transition hover:bg-primary/90 active:scale-95 motion-reduce:active:scale-100 shadow-sm"
        >
          <Icon name={iconName} className={`w-4 h-4 ${pending ? "animate-spin" : ""}`} />
          <span>{added ? "Added to cart" : (outcomeText ?? label)}</span>
        </button>
      </div>
    );
  }

  if (variant === "full") {
    const button = (
      <button
        type="button"
        onClick={onClickAdd}
        disabled={disabled || pending}
        aria-label={disabled ? `${productName} is out of stock` : label}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name={iconName} className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        <span>{disabled ? "Out of stock" : added ? "Added" : (outcomeText ?? label)}</span>
      </button>
    );
    if (!showNote) return button;
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={noteId} className="text-sm font-semibold text-primary">
          Note for this item <span className="font-normal text-primary-muted">(optional)</span>
        </label>
        <input
          id={noteId}
          type="text"
          name="customNote"
          value={note}
          maxLength={CUSTOM_NOTE_MAX_LENGTH}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Anything the store should know about this item"
          className="min-h-tap w-full rounded-xl border border-black/15 bg-white px-3 text-sm text-primary placeholder:text-primary-muted focus:border-action focus:outline-none"
        />
        {button}
      </div>
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
      <Icon name={iconName} className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
    </button>
  );
}
