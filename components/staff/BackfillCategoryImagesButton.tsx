"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import type { CategoryImageStyle } from "@/lib/category-image";

export interface BackfillCategoryImagesButtonProps {
  missingCount?: number;
}

export function BackfillCategoryImagesButton({
  missingCount = 0,
}: BackfillCategoryImagesButtonProps) {
  const [loading, setLoading] = useState(false);
  const [style, setStyle] = useState<CategoryImageStyle>("photo");
  const [result, setResult] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const router = useRouter();

  async function handleBackfill() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/category-images/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style }),
      });

      const data = (await res.json()) as {
        message?: string;
        error?: string;
        processed?: number;
        totalRemaining?: number;
      };

      if (!res.ok) {
        setResult({
          tone: "error",
          message: data.error || `The backfill was refused (${res.status}).`,
        });
        return;
      }

      setResult({
        tone: "ok",
        message: data.message || `Processed ${data.processed ?? 0} category images.`,
      });
      router.refresh();
    } catch (cause) {
      setResult({
        tone: "error",
        message: cause instanceof Error ? cause.message : "Failed to run category backfill.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleBackfill}
          disabled={loading || missingCount === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-action px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-action-hover disabled:opacity-50"
        >
          <Icon
            name="sparkles"
            className={`h-4 w-4 ${loading ? "animate-spin" : "text-amber-300"}`}
          />
          {loading
            ? "Generating missing category images…"
            : missingCount > 0
              ? `Auto-generate ${missingCount} missing image${missingCount === 1 ? "" : "s"}`
              : "All categories have images"}
        </button>

        <select
          aria-label="Image style"
          value={style}
          onChange={(e) => setStyle(e.target.value as CategoryImageStyle)}
          disabled={loading || missingCount === 0}
          className="rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-xs font-medium text-primary focus:border-action focus:outline-none"
        >
          <option value="photo">Studio Product Photography</option>
          <option value="3d-icon">Commercial 3D Rendered Icon</option>
        </select>
      </div>

      {result && (
        <div
          role={result.tone === "error" ? "alert" : "status"}
          className={`rounded-xl px-3 py-2 text-xs border ${
            result.tone === "error"
              ? "border-danger/30 bg-danger-tint/60 text-danger"
              : "border-primary/20 bg-surface-muted text-primary"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
