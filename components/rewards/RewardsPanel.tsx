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
  vendorName,
}: {
  open: boolean;
  onClose: () => void;
  data: RewardsData | null;
  /** #729 — the current vendor's display name, so the header reads "{vendorName} Club". */
  vendorName: string;
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
      className="fixed bottom-20 left-4 z-50 sm:bottom-24 sm:left-8 w-[360px] max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto rounded-3xl bg-white text-primary shadow-2xl border border-black/10 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
    >
      {/* Brand header in the current vendor's colours and name (#729: the label used to hardcode one vendor's name) */}
      <div className="bg-primary text-white p-6 rounded-t-3xl relative">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-amber-300">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-xs font-black tracking-wider uppercase text-white">
              {vendorName} Club
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close rewards panel"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white transition"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
            {authenticated ? "Your Loyalty Points" : "Loyalty Rewards"}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-white">
              {authenticated ? balancePoints : 0}
            </span>
            <span className="text-sm font-semibold text-white/80">points</span>
          </div>

          {authenticated && expiryDate && (
            <div className="mt-2.5 inline-flex items-center rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white">
              Expiration date: {expiryDate}
            </div>
          )}

          {authenticated && !expiryDate && balancePoints > 0 && (
            <div className="mt-2.5 inline-flex items-center rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white">
              Points active
            </div>
          )}

          {tier && (
            <div className="mt-2 text-xs font-medium text-white/90">
              Tier: <strong>{tier.name}</strong> (
              {((tier.multiplierBps ?? 10000) / 10000).toFixed(2)}× points)
            </div>
          )}

          {!authenticated && (
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-stone-100 transition"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Main Panel Content matching store surface aesthetics */}
      <div className="p-4 space-y-3 bg-surface-muted/50">
        {/* Accordions */}
        <div className="space-y-2">
          <WaysToEarnAccordion
            pointsPerPoundEarned={pointsPerPoundEarned}
            rewardPoints={rewardPoints}
            variant="light"
          />

          <WaysToRedeemAccordion
            pencePerPointRedeemed={pencePerPointRedeemed}
            minRedeemPoints={minRedeemPoints}
            variant="light"
          />
        </div>

        {/* Referrals Section */}
        <ReferralCard
          referralUrl={referralUrl}
          referralCode={referralCode}
          completedCount={referralsCompleted}
          discountOffPence={discountOffPence}
          rewardPoints={rewardPoints}
          variant="light"
          authenticated={authenticated}
          storeName={vendorName}
        />

        {/* Account Link */}
        <div className="pt-1 text-center">
          <Link
            href="/account/loyalty"
            onClick={onClose}
            className="text-xs text-action hover:underline font-semibold"
          >
            View full loyalty account details →
          </Link>
        </div>
      </div>
    </div>
  );
}
