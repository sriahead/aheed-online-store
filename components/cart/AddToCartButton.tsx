"use client";

import { useState, useTransition } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { addToCart } from "@/features/cart/add-to-cart";

/**
 * The one client island on the product grid (P3a, #93).
 *
 * ProductCard wraps its whole body in a <Link>, so a nested button would
 * navigate on click — hence the explicit preventDefault/stopPropagation. That
 * was chosen over restructuring the card, which would churn P2.5b2's shipped
 * visual work for no user-visible gain.
 */
export function AddToCartButton({
  productId,
  disabled = false,
  label = "Add to cart",
  variant = "icon",
}: {
  productId: string;
  disabled?: boolean;
  label?: string;
  variant?: "icon" | "full";
}) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  function onClick(e: React.MouseEvent) {
    // Inside ProductCard's <Link> — must not navigate.
    e.preventDefault();
    e.stopPropagation();
    if (disabled || pending) return;
    startTransition(async () => {
      await addToCart(productId);
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
    });
  }

  const Icon = pending ? Loader2 : added ? Check : Plus;

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || pending}
        aria-label={disabled ? "Out of stock" : label}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
        <span>{disabled ? "Out of stock" : added ? "Added" : label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      aria-label={disabled ? "Out of stock" : label}
      className="flex items-center justify-center rounded-full bg-primary p-2 text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
    </button>
  );
}
