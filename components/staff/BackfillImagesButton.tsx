"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

export function BackfillImagesButton() {
  const [loading, setLoading] = useState(false);
  /**
   * #502 — whether this run consults Open Food Facts before falling back to AI
   * generation. On by default, and per-run rather than stored: Open Food Facts
   * ranks on keyword overlap, so similarly-named products can all resolve to
   * one hit and return the same image repeatedly. An operator watching that
   * happen needs to switch the source off, re-run, and switch it back — without
   * waiting for a deploy, which is what a config value would have cost.
   */
  const [useOpenFoodFacts, setUseOpenFoodFacts] = useState(true);
  const router = useRouter();

  const handleBackfill = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/jobs/backfill-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useOpenFoodFacts }),
      });
      const data = (await res.json()) as any;
      alert(data.message + (data.processed ? ` (${data.processed} generated)` : ""));
      router.refresh();
    } catch (err) {
      alert("Failed to start backfill");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={handleBackfill}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-2xl bg-action px-4 py-2.5 text-sm font-bold text-white transition hover:bg-action-hover disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        {loading ? "Generating..." : "Auto-fill Missing Images"}
      </button>
      <label className="flex items-center gap-2 text-xs font-medium text-primary/70">
        <input
          type="checkbox"
          checked={useOpenFoodFacts}
          onChange={(event) => setUseOpenFoodFacts(event.target.checked)}
          disabled={loading}
          className="h-3.5 w-3.5 rounded border-black/20 accent-action"
        />
        Use Open Food Facts photos
      </label>
    </div>
  );
}
