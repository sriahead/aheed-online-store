"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import type { CategoryImageStyle } from "@/lib/category-image";

export interface CategoryImageManagerProps {
  categoryId: string | null;
  categoryName: string;
  imageKey: string | null;
  imageUrl: string | null;
  onImageKeyChange?: (newKey: string) => void;
}

export function CategoryImageManager({
  categoryId,
  categoryName,
  imageKey,
  imageUrl,
  onImageKeyChange,
}: CategoryImageManagerProps) {
  const [style, setStyle] = useState<CategoryImageStyle>("photo");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(imageUrl);
  const [currentKey, setCurrentKey] = useState<string | null>(imageKey);
  const router = useRouter();

  async function handleGenerate() {
    if (!categoryId) {
      setError("Please save the category first before generating imagery.");
      return;
    }

    setError(null);
    setGenerating(true);

    try {
      const res = await fetch("/api/admin/category-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, style }),
      });

      const data = (await res.json()) as {
        error?: string;
        imageKey?: string;
        imageUrl?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate category image.");
      }

      if (data.imageKey && data.imageUrl) {
        setCurrentKey(data.imageKey);
        setCurrentUrl(data.imageUrl);
        if (onImageKeyChange) {
          onImageKeyChange(data.imageKey);
        }
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-primary">Category Imagery & Icon</h3>
          <p className="text-xs text-primary-muted">
            Commercial photography or 3D app icon representing this department.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor={`category-image-style-${categoryId ?? "new"}`}
            className="text-xs font-semibold text-primary-muted"
          >
            Style:
          </label>
          <select
            id={`category-image-style-${categoryId ?? "new"}`}
            value={style}
            onChange={(e) => setStyle(e.target.value as CategoryImageStyle)}
            disabled={generating}
            className="rounded-lg border border-black/15 bg-surface-muted px-2.5 py-1 text-xs font-medium text-primary focus:border-action focus:outline-none"
          >
            <option value="photo">Studio Product Photography</option>
            <option value="3d-icon">Commercial 3D Rendered Icon</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Thumbnail Preview */}
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-surface-muted">
          {currentUrl ? (
            <ImageWithFallback
              src={currentUrl}
              alt={categoryName || "Category preview"}
              width={96}
              height={96}
              className="h-full w-full object-cover"
              fallback={<Icon name="folder-tree" className="h-8 w-8 text-primary-subtle" />}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-2">
              <Icon name="folder-tree" className="h-7 w-7 text-primary-subtle mb-1" />
              <span className="text-[10px] text-primary-subtle">No image</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !categoryId}
              className="inline-flex items-center gap-2 rounded-xl bg-action px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-action-hover disabled:opacity-50"
            >
              <Icon
                name="sparkles"
                className={`h-4 w-4 ${generating ? "animate-spin" : "text-amber-300"}`}
              />
              {generating ? "Generating with AI…" : "Auto-generate image"}
            </button>
            {currentKey && (
              <span className="text-xs text-primary-muted font-mono truncate max-w-xs">
                {currentKey}
              </span>
            )}
          </div>

          {!categoryId && (
            <p className="text-xs text-primary-muted">
              Save this category first to enable one-click AI generation.
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-danger/30 bg-danger-tint/60 px-3 py-2 text-xs text-danger"
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
