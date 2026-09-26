"use client";

import { useState } from "react";
import { Check, Copy, Share2, Users } from "lucide-react";
import { buildShareLinks } from "@/lib/referrals";
import { formatPrice } from "@/components/product/format-price";

function FacebookIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function TwitterIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function MailIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export function ReferralCard({
  referralUrl,
  referralCode,
  completedCount = 0,
  discountOffPence = 500,
  rewardPoints = 100,
  variant = "light",
  authenticated = true,
  storeName,
}: {
  referralUrl?: string;
  referralCode?: string;
  completedCount?: number;
  discountOffPence?: number;
  rewardPoints?: number;
  variant?: "light" | "dark";
  authenticated?: boolean;
  /** #729 — the current vendor's display name, used in every share message. */
  storeName: string;
}) {
  const [copied, setCopied] = useState(false);

  const isDark = variant === "dark";
  const displayUrl = referralUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const shareLinks = buildShareLinks(displayUrl, storeName);

  const handleCopy = async () => {
    if (!displayUrl) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share && displayUrl) {
      try {
        await navigator.share({
          title: `${storeName} referral`,
          text: `Use my invite link to get ${formatPrice(discountOffPence)} off your first order at ${storeName}!`,
          url: displayUrl,
        });
      } catch {
        // user dismissed
      }
    }
  };

  return (
    <div
      className={`rounded-2xl transition border ${
        isDark ? "border-white/10 bg-white/5 text-white" : "border-black/10 bg-white text-primary"
      } p-5`}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              isDark ? "bg-amber-400/20 text-amber-400" : "bg-action-tint text-action"
            }`}
          >
            <Users className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Refer your friends</h3>
            <p className={`text-xs ${isDark ? "text-amber-400" : "text-action"} font-medium`}>
              {completedCount} {completedCount === 1 ? "referral" : "referrals"} completed
            </p>
          </div>
        </div>

        {typeof navigator !== "undefined" && "share" in navigator && (
          <button
            type="button"
            onClick={handleNativeShare}
            aria-label="Share referral link"
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              isDark ? "bg-white/10 hover:bg-white/20" : "bg-black/5 hover:bg-black/10"
            } transition`}
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <p
        className={`mt-2 text-xs leading-relaxed ${isDark ? "text-stone-300" : "text-primary-muted"}`}
      >
        Share this URL to give your friends {formatPrice(discountOffPence)} off their first order
        and earn <strong>{rewardPoints} bonus points</strong> when they complete it.
      </p>

      {authenticated ? (
        <div className="mt-4 space-y-3">
          {/* Referral link box with copy button */}
          <div
            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-mono transition ${
              isDark
                ? "border-white/10 bg-black/40 text-stone-200"
                : "border-black/10 bg-surface-muted text-primary"
            }`}
          >
            <span className="truncate select-all">{displayUrl}</span>
            <button
              type="button"
              onClick={handleCopy}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                copied
                  ? isDark
                    ? "bg-green-500/20 text-green-400"
                    : "bg-action-tint text-action"
                  : isDark
                    ? "bg-amber-400 text-stone-900 hover:bg-amber-300"
                    : "bg-action text-white hover:bg-action-hover"
              }`}
              aria-label="Copy referral link"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Social share icons row */}
          <div className="flex items-center justify-center gap-4 pt-1">
            <a
              href={shareLinks.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share referral link on Facebook"
              className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                isDark
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-black/5 text-primary hover:bg-black/10"
              }`}
            >
              <FacebookIcon className="h-4 w-4" />
            </a>

            <a
              href={shareLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share referral link on X"
              className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                isDark
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-black/5 text-primary hover:bg-black/10"
              }`}
            >
              <TwitterIcon className="h-4 w-4" />
            </a>

            <a
              href={shareLinks.email}
              aria-label="Share referral link via Email"
              className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                isDark
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-black/5 text-primary hover:bg-black/10"
              }`}
            >
              <MailIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-black/20 p-3 text-center text-xs">
          <p className="text-stone-300">
            Sign in to your account to get your unique referral link.
          </p>
        </div>
      )}
    </div>
  );
}
