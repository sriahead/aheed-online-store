"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";

/**
 * #1535 — "Fill missing bundle photos": the bundle counterpart of `BackfillImagesButton`, with the
 * same inline result (never `alert()`, #507) and the same refusal tone when the AI allowance stops a
 * run part way (#1031). There is no Open Food Facts switch: a bundle is not a product it can find.
 */
export function BackfillBundleImagesButton({ missingCount }: { missingCount: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const router = useRouter();

  async function fill() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/bundle-images/backfill", { method: "POST" });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        processed?: number;
        budgetRefused?: boolean;
      };
      if (!res.ok) {
        setResult({
          tone: "error",
          message: data.error ?? `The fill was refused (${res.status}).`,
        });
        return;
      }
      const processed = data.processed ?? 0;
      const done = processed ? ` (${processed} generated)` : "";
      setResult({
        tone: data.budgetRefused ? "error" : "ok",
        message: `${data.message ?? "Done"}${done}`,
      });
      router.refresh();
    } catch {
      setResult({ tone: "error", message: "The fill could not be started." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={fill}
        disabled={loading || missingCount === 0}
        className="inline-flex items-center gap-2 rounded-2xl bg-action px-4 py-2.5 text-sm font-bold text-white transition hover:bg-action-hover disabled:opacity-50"
      >
        <Icon name="sparkles" className="h-4 w-4" />
        {loading
          ? "Generating…"
          : missingCount === 0
            ? "Every bundle has a photo"
            : `Fill missing bundle photos (${missingCount})`}
      </button>
      <p className="text-xs text-primary-muted">
        Up to 10 per click, live bundles first. Each photo counts against today&apos;s AI allowance
        and is marked for review.
      </p>
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
