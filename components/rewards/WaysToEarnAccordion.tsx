"use client";

import { useState } from "react";
import { ChevronDown, Coins, Sparkles, UserPlus } from "lucide-react";
import { formatPrice } from "@/components/product/format-price";
import { MIN_REFERRAL_ORDER_PENCE, REFERRAL_DISCOUNT_PENCE } from "@/lib/referrals";

export function WaysToEarnAccordion({
  pointsPerPoundEarned = 1,
  rewardPoints = 100,
  discountOffPence = REFERRAL_DISCOUNT_PENCE,
  maxMultiplier = 1,
  variant = "light",
}: {
  pointsPerPoundEarned?: number;
  rewardPoints?: number;
  /** #1079 — the friend's discount, from the same constant `ReferralCard` and the code use. */
  discountOffPence?: number;
  maxMultiplier?: number;
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
            <Coins className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold">Ways to earn</span>
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
            <Coins
              className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-action"}`}
            />
            <div>
              <p className={`font-semibold ${isDark ? "text-white" : "text-primary"}`}>
                Place an order
              </p>
              {/* #1077 — "point" was hardcoded singular, so any vendor earning more than one point
                  per pound read "Earn 2 point for every £1" (triage item 12b). */}
              <p>
                Earn {pointsPerPoundEarned} {pointsPerPoundEarned === 1 ? "point" : "points"} for
                every £1 spent on eligible items across the store.
              </p>
            </div>
          </div>

          {maxMultiplier > 1 && (
            <div className="flex items-start gap-2.5">
              <Sparkles
                className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-accent"}`}
              />
              <div>
                <p className={`font-semibold ${isDark ? "text-white" : "text-primary"}`}>
                  Loyalty tier boosts
                </p>
                <p>
                  Unlock higher tiers to earn up to {maxMultiplier}× points multipliers on orders.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5">
            <UserPlus
              className={`h-4 w-4 shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-action"}`}
            />
            <div>
              <p className={`font-semibold ${isDark ? "text-white" : "text-primary"}`}>
                Refer your friends
              </p>
              {/* #1079 — the same facts ReferralCard states since #1077. This used to promise a
                  friend's "qualifying first order": "qualifying" was never defined (the rule is a
                  minimum spend, MIN_REFERRAL_ORDER_PENCE), and nothing restricts the code to a
                  FIRST order (it is one use per friend, on any order). */}
              <p>
                Give a friend {formatPrice(discountOffPence)} off an order of{" "}
                {formatPrice(MIN_REFERRAL_ORDER_PENCE)} or more. Each friend can use it once, and
                you earn {rewardPoints} bonus points when their order is confirmed.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
