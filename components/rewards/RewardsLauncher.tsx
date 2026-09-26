"use client";

import { useEffect, useState } from "react";
import { Gift, X } from "lucide-react";
import { RewardsPanel, type RewardsData } from "@/components/rewards/RewardsPanel";

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

  // Capture ?ref=... parameter from URL if present and persist in a cookie
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const refCode = params.get("ref");
      if (refCode && refCode.trim() !== "") {
        document.cookie = `aheed_referral_code=${encodeURIComponent(
          refCode.trim(),
        )}; path=/; max-age=2592000; SameSite=Lax`;
      }
    }
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
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <>
              <Gift className="h-4 w-4 text-amber-300" aria-hidden="true" />
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
