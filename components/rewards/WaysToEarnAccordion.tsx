"use client";

import { useState } from "react";
import { ChevronDown, Coins, Sparkles, UserPlus } from "lucide-react";

export function WaysToEarnAccordion({
  pointsPerPoundEarned = 1,
  rewardPoints = 100,
  maxMultiplier = 1,
  variant = "light",
}: {
  pointsPerPoundEarned?: number;
  rewardPoints?: number;
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
                Order groceries
              </p>
              <p>
                Earn {pointsPerPoundEarned} point for every £1 spent on eligible items across the
                store.
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
              <p>
                Earn {rewardPoints} bonus points when a referred friend places their qualifying
                first order.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
