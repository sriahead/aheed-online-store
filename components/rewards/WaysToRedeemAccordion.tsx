"use client";

import { useState } from "react";
import { ChevronDown, Gift, ShoppingBag, Percent } from "lucide-react";
import { formatPrice } from "@/components/product/format-price";

export function WaysToRedeemAccordion({
  pencePerPointRedeemed = 1,
  minRedeemPoints = 100,
  variant = "light",
}: {
  pencePerPointRedeemed?: number;
  minRedeemPoints?: number;
  variant?: "light" | "dark";
}) {
  const [isOpen, setIsOpen] = useState(false);

  const isDark = variant === "dark";

  return (
    <div
      className={`rounded-2xl transition border ${
        isDark ? "border-white/10 bg-white/5 text-white" : "border-black/10 bg-white text-primary"
      }`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-4 text-left font-semibold focus:outline-none"
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              isDark ? "bg-amber-400/20 text-amber-400" : "bg-action-tint text-action"
            }`}
          >
            <Gift className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold">Ways to redeem</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          } ${isDark ? "text-stone-400" : "text-primary-muted"}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className={`space-y-3 px-4 pb-4 pt-1 text-xs border-t ${
            isDark ? "border-white/10 text-stone-300" : "border-black/5 text-primary-muted"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <Gift
              className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-action"}`}
            />
            <div>
              <p className={`font-semibold ${isDark ? "text-white" : "text-primary"}`}>
                Instant checkout discount
              </p>
              <p>
                Every 100 points equals {formatPrice(100 * pencePerPointRedeemed)} off your grocery
                basket.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Percent
              className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-accent"}`}
            />
            <div>
              <p className={`font-semibold ${isDark ? "text-white" : "text-primary"}`}>
                Low redemption threshold
              </p>
              <p>
                Start redeeming points as soon as your balance reaches {minRedeemPoints} points (
                {formatPrice(minRedeemPoints * pencePerPointRedeemed)}).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <ShoppingBag
              className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-action"}`}
            />
            <div>
              <p className={`font-semibold ${isDark ? "text-white" : "text-primary"}`}>
                Seamless at checkout
              </p>
              <p>
                Apply your desired points at checkout with one tap to reduce your payable total.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
