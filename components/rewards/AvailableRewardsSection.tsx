"use client";

import { Gift, Lock, CheckCircle2 } from "lucide-react";
import { formatPrice } from "@/components/product/format-price";

interface RewardVoucher {
  id: string;
  pointsNeeded: number;
  discountPence: number;
  label: string;
}

export function AvailableRewardsSection({
  balancePoints = 0,
  pencePerPointRedeemed = 1,
  minRedeemPoints = 100,
  variant = "light",
}: {
  balancePoints?: number;
  pencePerPointRedeemed?: number;
  minRedeemPoints?: number;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";

  // Supported discount tiers
  const vouchers: RewardVoucher[] = [
    {
      id: "v-1",
      pointsNeeded: minRedeemPoints,
      discountPence: minRedeemPoints * pencePerPointRedeemed,
      label: `${formatPrice(minRedeemPoints * pencePerPointRedeemed)} Off Basket`,
    },
    {
      id: "v-5",
      pointsNeeded: 500,
      discountPence: 500 * pencePerPointRedeemed,
      label: `${formatPrice(500 * pencePerPointRedeemed)} Off Basket`,
    },
    {
      id: "v-10",
      pointsNeeded: 1000,
      discountPence: 1000 * pencePerPointRedeemed,
      label: `${formatPrice(1000 * pencePerPointRedeemed)} Off Basket`,
    },
  ];

  return (
    <div
      className={`rounded-2xl transition border ${
        isDark ? "border-white/10 bg-white/5 text-white" : "border-black/10 bg-white text-primary"
      } p-5`}
    >
      <div className="flex items-center gap-2 mb-4">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            isDark ? "bg-amber-400/20 text-amber-400" : "bg-action-tint text-action"
          }`}
        >
          <Gift className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Available rewards</h3>
          <p className={`text-xs ${isDark ? "text-stone-400" : "text-primary-muted"}`}>
            Redeem points at checkout for money off your order
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {vouchers.map((voucher) => {
          const isUnlocked = balancePoints >= voucher.pointsNeeded;
          const pointsRemaining = voucher.pointsNeeded - balancePoints;
          const progressPercent = Math.min(
            100,
            Math.round((balancePoints / voucher.pointsNeeded) * 100),
          );

          return (
            <div
              key={voucher.id}
              className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition ${
                isUnlocked
                  ? isDark
                    ? "border-amber-400/40 bg-amber-400/10 text-white"
                    : "border-action/30 bg-action-tint/30 text-primary"
                  : isDark
                    ? "border-white/10 bg-white/[0.02] text-stone-400"
                    : "border-black/10 bg-surface-muted/50 text-primary-muted"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${
                      isUnlocked
                        ? isDark
                          ? "text-amber-400"
                          : "text-action"
                        : isDark
                          ? "text-stone-400"
                          : "text-primary-muted"
                    }`}
                  >
                    {voucher.pointsNeeded} pts
                  </span>
                  {isUnlocked ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-action">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Ready</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-stone-400">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                    </span>
                  )}
                </div>

                <p className={`text-sm font-bold ${isDark ? "text-white" : "text-primary"}`}>
                  {voucher.label}
                </p>
              </div>

              <div className="mt-3">
                <div
                  className={`h-1.5 w-full overflow-hidden rounded-full ${
                    isDark ? "bg-white/10" : "bg-black/10"
                  }`}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isUnlocked
                        ? isDark
                          ? "bg-amber-400"
                          : "bg-action"
                        : isDark
                          ? "bg-amber-400/50"
                          : "bg-action/50"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] truncate">
                  {isUnlocked
                    ? "Available at checkout"
                    : `${pointsRemaining} more ${pointsRemaining === 1 ? "point" : "points"} needed`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
