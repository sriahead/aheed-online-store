"use client";

import { useEffect, useState } from "react";
import { Gift, X } from "lucide-react";
import { RewardsPanel, type RewardsData } from "@/components/rewards/RewardsPanel";

export function RewardsLauncher() {
  const [open, setOpen] = useState(false);
  const [rewardsData, setRewardsData] = useState<RewardsData | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Fetch rewards data when opened or lazily
  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch("/api/rewards");
        if (res.ok) {
          const json = (await res.json()) as RewardsData;
          if (!ignore) {
            setRewardsData(json);
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
          className={`flex items-center gap-2 rounded-full font-bold shadow-[0_8px_30px_rgb(0,0,0,0.25)] transition-all duration-200 hover:scale-105 motion-reduce:hover:scale-100 ${
            open
              ? "h-12 w-12 justify-center bg-[#facc15] text-stone-900 hover:bg-[#eab308]"
              : "bg-[#facc15] px-4 py-3 text-sm text-stone-900 hover:bg-[#eab308]"
          }`}
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <>
              <Gift className="h-4 w-4" aria-hidden="true" />
              <span>Rewards</span>
            </>
          )}
        </button>
      </div>

      <RewardsPanel open={open} onClose={() => setOpen(false)} data={rewardsData} />
    </>
  );
}
