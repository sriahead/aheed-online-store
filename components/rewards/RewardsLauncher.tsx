"use client";

import { useEffect, useState } from "react";
import { RewardsPanel, type RewardsData } from "@/components/rewards/RewardsPanel";
import {
  CONSENT_CHANGE_EVENT,
  expireBrowserCookie,
  isConsentValue,
  LEGACY_REFERRAL_COOKIE,
  readBrowserConsent,
  REFERRAL_COOKIE,
  type ConsentValue,
} from "@/lib/storage-keys";
import { Icon } from "@/components/icons/Icon";
import { Icon3D } from "@/components/icons/Icon3D";

/**
 * `vendorName` comes from the storefront layout (`StorefrontChrome`) as a prop — CLAUDE.md rules
 * out a middleware to carry it, and a client component cannot resolve the vendor itself (#729).
 */
export function RewardsLauncher({
  initialData,
  vendorName,
}: {
  initialData?: RewardsData | null;
  vendorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [overrideData, setOverrideData] = useState<RewardsData | null>(null);
  const [loading, setLoading] = useState(false);

  const rewardsData = overrideData ?? initialData ?? null;

  // #1065 — a `?ref=` code is optional storage, not strictly necessary, so it is written only once
  // the shopper has chosen Accept All. Until then it is held in memory (this effect's closure, not
  // any browser storage). This component sits in the storefront layout, so a held code survives
  // client-side navigation but not a full reload; a shopper who never accepts can still type it at
  // checkout. Choosing Essential Only also clears a code written before this gate existed.
  useEffect(() => {
    const refCode = new URLSearchParams(window.location.search).get("ref")?.trim() || null;

    const apply = (consent: ConsentValue | null) => {
      if (consent === "essential") {
        expireBrowserCookie(REFERRAL_COOKIE);
        expireBrowserCookie(LEGACY_REFERRAL_COOKIE);
      } else if (consent === "accepted" && refCode) {
        document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(
          refCode,
        )}; path=/; max-age=2592000; SameSite=Lax; Secure`;
      }
    };

    const current = readBrowserConsent();
    apply(current);
    if (current !== null) return;

    const onConsent = (event: Event) => {
      const value = (event as CustomEvent<{ value?: string }>).detail?.value;
      if (isConsentValue(value)) apply(value);
    };
    window.addEventListener(CONSENT_CHANGE_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onConsent);
  }, []);

  // Fetch rewards data when opened if not already present
  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch("/api/rewards", {
          cache: "no-store",
          credentials: "include",
        });
        if (res.ok) {
          const json = (await res.json()) as RewardsData;
          if (!ignore) {
            setOverrideData(json);
          }
        }
      } catch {
        // network error
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    if (open && !rewardsData && !loading) {
      loadData();
    }

    return () => {
      ignore = true;
    };
  }, [open, rewardsData, loading]);

  return (
    <>
      <div className="fixed bottom-6 left-6 z-50 sm:bottom-8 sm:left-8">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={open ? "Close rewards panel" : "Open rewards and loyalty panel"}
          title={open ? "Close rewards" : "Rewards"}
          className={`flex items-center gap-2 rounded-full font-bold shadow-[0_8px_30px_rgb(0,0,0,0.25)] border border-white/20 transition-all duration-200 hover:scale-105 motion-reduce:hover:scale-100 ${
            open
              ? "h-12 w-12 justify-center bg-primary text-white hover:bg-primary/90"
              : "bg-primary px-4 py-3 text-sm text-white hover:bg-primary/90"
          }`}
        >
          {open ? (
            <Icon name="x" className="h-5 w-5" />
          ) : (
            <>
              <Icon3D name="rewards-coin" size={20} className="-my-0.5" decorative />
              <span className="hidden">
                <Icon name="rewards-gift" />
              </span>
              <span>Rewards</span>
            </>
          )}
        </button>
      </div>

      <RewardsPanel
        open={open}
        onClose={() => setOpen(false)}
        data={rewardsData}
        vendorName={vendorName}
      />
    </>
  );
}
