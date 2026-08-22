"use client";

import { useState, useTransition } from "react";
import { Plus, Check, Loader2, Minus } from "lucide-react";
import { addToCart } from "@/features/cart/add-to-cart";

export function AddToCartButton({
  productId,
  disabled = false,
  label = "Add to cart",
  variant = "icon",
}: {
  productId: string;
  disabled?: boolean;
  label?: string;
  variant?: "icon" | "full" | "card";
}) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);

  function onClickAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || pending) return;
    startTransition(async () => {
      await addToCart(productId, qty);
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
      setQty(1);
    });
  }

  function onClickMinus(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (qty > 1) setQty((q) => q - 1);
  }

  function onClickPlus(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (qty < 99) setQty((q) => q + 1);
  }

  const Icon = pending ? Loader2 : added ? Check : Plus;

  if (variant === "card") {
    if (disabled) {
      return (
        <button
          type="button"
          disabled
          className="flex w-full items-center justify-center rounded-xl bg-surface-muted px-4 py-2 text-xs font-bold text-black/40 cursor-not-allowed"
        >
          Out of stock
        </button>
      );
    }

    return (
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center rounded-xl border border-black/10 bg-surface-muted overflow-hidden h-8">
          <button
            type="button"
            onClick={onClickMinus}
            aria-label="Decrease quantity"
            className="px-2 h-full flex items-center justify-center text-black/70 hover:bg-black/5 hover:text-black transition-colors"
          >
            <Minus className="w-3 h-3" aria-hidden="true" />
          </button>
          <span className="text-xs font-semibold text-primary w-4 text-center">{qty}</span>
          <button
            type="button"
            onClick={onClickPlus}
            aria-label="Increase quantity"
            className="px-2 h-full flex items-center justify-center text-black/70 hover:bg-black/5 hover:text-black transition-colors"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onClickAdd}
          disabled={pending}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-primary text-white text-xs font-bold transition-all hover:bg-primary/90 active:scale-95 shadow-sm"
        >
          <Icon className="w-3.5 h-3.5" />
          {added ? "Added" : "Add"}
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
        aria-label={disabled ? "Out of stock" : label}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon className="h-4 w-4" aria-hidden />
        <span>{disabled ? "Out of stock" : added ? "Added" : label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClickAdd}
      disabled={disabled || pending}
      aria-label={disabled ? "Out of stock" : label}
      className="flex items-center justify-center rounded-full bg-primary p-2 text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
