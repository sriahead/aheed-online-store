"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X, Sparkles } from "lucide-react";
import { WaysToEarnAccordion } from "@/components/rewards/WaysToEarnAccordion";
import { WaysToRedeemAccordion } from "@/components/rewards/WaysToRedeemAccordion";
import { ReferralCard } from "@/components/rewards/ReferralCard";

export interface RewardsData {
  authenticated: boolean;
  loyaltyEnabled: boolean;
  balancePoints: number;
  expiryDate: string | null;
  pointsPerPoundEarned: number;
  pencePerPointRedeemed: number;
  minRedeemPoints: number;
  tier: { name: string; multiplierBps: number } | null;
  referralCode: string;
  referralsCompleted: number;
  referralUrl: string;
  discountOffPence: number;
  rewardPoints: number;
}

export function RewardsPanel({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: RewardsData | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const authenticated = data?.authenticated ?? false;
  const balancePoints = data?.balancePoints ?? 0;
  const expiryDate = data?.expiryDate ?? null;
  const pointsPerPoundEarned = data?.pointsPerPoundEarned ?? 1;
  const pencePerPointRedeemed = data?.pencePerPointRedeemed ?? 1;
  const minRedeemPoints = data?.minRedeemPoints ?? 100;
  const tier = data?.tier ?? null;
  const referralCode = data?.referralCode ?? "";
  const referralsCompleted = data?.referralsCompleted ?? 0;
  const referralUrl = data?.referralUrl ?? "";
  const discountOffPence = data?.discountOffPence ?? 500;
  const rewardPoints = data?.rewardPoints ?? 100;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Loyalty and Rewards"
      className="fixed bottom-20 left-4 z-50 sm:bottom-24 sm:left-8 w-[360px] max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto rounded-3xl bg-[#1c1c1e] text-white shadow-2xl border border-white/10 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
    >
      {/* Yellow/Amber Brand Header matching the reference screenshot */}
      <div className="bg-[#facc15] text-stone-900 p-6 rounded-t-3xl relative">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-[#facc15]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-xs font-black tracking-wider uppercase">Aheed Club</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close rewards panel"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-900/10 hover:bg-stone-900/20 text-stone-900 transition"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
            {authenticated ? "Your Loyalty Points" : "Loyalty Rewards"}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight">
              {authenticated ? balancePoints : 0}
            </span>
            <span className="text-sm font-semibold opacity-75">points</span>
          </div>

          {authenticated && expiryDate && (
            <div className="mt-2.5 inline-flex items-center rounded-md bg-stone-900/15 px-2.5 py-1 text-[11px] font-medium text-stone-900">
              Expiration date: {expiryDate}
            </div>
          )}

          {authenticated && !expiryDate && balancePoints > 0 && (
            <div className="mt-2.5 inline-flex items-center rounded-md bg-stone-900/15 px-2.5 py-1 text-[11px] font-medium text-stone-900">
              Points active
            </div>
          )}

          {tier && (
            <div className="mt-2 text-xs font-medium text-stone-800">
              Tier: <strong>{tier.name}</strong> (
              {((tier.multiplierBps ?? 10000) / 10000).toFixed(2)}× points)
            </div>
          )}

          {!authenticated && (
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 transition"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg border border-stone-900/30 px-3 py-1.5 text-xs font-semibold text-stone-900 hover:bg-stone-900/10 transition"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="p-4 space-y-3">
        {/* Accordions */}
        <div className="space-y-2">
          <WaysToEarnAccordion
            pointsPerPoundEarned={pointsPerPoundEarned}
            rewardPoints={rewardPoints}
            variant="dark"
          />

          <WaysToRedeemAccordion
            pencePerPointRedeemed={pencePerPointRedeemed}
            minRedeemPoints={minRedeemPoints}
            variant="dark"
          />
        </div>

        {/* Referrals Section */}
        <ReferralCard
          referralUrl={referralUrl}
          referralCode={referralCode}
          completedCount={referralsCompleted}
          discountOffPence={discountOffPence}
          rewardPoints={rewardPoints}
          variant="dark"
          authenticated={authenticated}
        />

        {/* Account Link */}
        <div className="pt-1 text-center">
          <Link
            href="/account/loyalty"
            onClick={onClose}
            className="text-xs text-amber-400 hover:underline font-medium"
          >
            View full loyalty account details →
          </Link>
        </div>
      </div>
    </div>
  );
}
