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
  /**
   * #507 — the run's outcome, rendered inline rather than through `alert()`.
   *
   * A native `alert()` blocks the whole tab until someone clicks it. For an
   * operator that is a modal in the way of a background job's result; for
   * browser automation it freezes the page outright — CDP calls, screenshots
   * and even closing the tab all hang until a human dismisses it by hand, so
   * this button could not be exercised end-to-end by any scripted check.
   *
   * This was the only `alert()` in the admin panel; every other action already
   * reports inline, so this matches `BundleForm`'s `role="alert"` /
   * `role="status"` pair rather than introducing a third convention.
   */
  const [result, setResult] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const router = useRouter();

  const handleBackfill = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/jobs/backfill-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useOpenFoodFacts }),
      });
      const data = (await res.json()) as { message?: string; error?: string; processed?: number };

      if (!res.ok) {
        // The route answers 401/403 with `error`, not `message` — reporting
        // `undefined` here would tell an operator refused for the wrong role
        // nothing at all.
        setResult({
          tone: "error",
          message: data.error ?? `The backfill was refused (${res.status}).`,
        });
        return;
      }

      const processed = data.processed ?? 0;
      setResult({
        tone: "ok",
        message: `${data.message ?? "Backfill complete"}${processed ? ` (${processed} generated)` : ""}`,
      });
      router.refresh();
    } catch {
      setResult({ tone: "error", message: "Failed to start backfill." });
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
      {result && (
        <p
          role={result.tone === "error" ? "alert" : "status"}
          className={
            result.tone === "error"
              ? "rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
              : "rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
          }
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
