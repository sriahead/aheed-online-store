"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import type { CategoryImageStyle } from "@/lib/category-image";

export interface CategoryAssetItem {
  id: string;
  vendorId: string;
  categoryId: string | null;
  slot: string | null;
  storageKey: string;
  style: string;
  isSelected: boolean;
  createdAt: string | Date;
  imageUrl?: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface CategoryImageManagerProps {
  categoryId: string | null;
  categoryName: string;
  imageKey: string | null;
  imageUrl: string | null;
  onImageKeyChange?: (newKey: string) => void;
}

function useOptionalRouter() {
  try {
    return useRouter();
  } catch {
    return null;
  }
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
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(imageUrl);
  const [currentKey, setCurrentKey] = useState<string | null>(imageKey);
  const [assets, setAssets] = useState<CategoryAssetItem[]>([]);
  const router = useOptionalRouter();

  const loadAssets = useCallback(async () => {
    if (!categoryId) return;
    try {
      const res = await fetch(
        `/api/admin/category-images/assets?categoryId=${encodeURIComponent(categoryId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { assets?: CategoryAssetItem[] };
      if (Array.isArray(data.assets)) {
        setAssets(data.assets);
      }
    } catch {
      // Non-fatal if offline or jsdom
    }
  }, [categoryId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of candidate assets
    loadAssets();
  }, [loadAssets]);

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
        asset?: CategoryAssetItem;
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

        if (data.asset) {
          const newAsset: CategoryAssetItem = {
            ...data.asset,
            imageUrl: data.imageUrl,
            isSelected: true,
          };
          setAssets((prev) => [newAsset, ...prev.map((a) => ({ ...a, isSelected: false }))]);
        } else {
          loadAssets();
        }

        router?.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSelect(asset: CategoryAssetItem) {
    setError(null);
    setActionPendingId(asset.id);

    try {
      const res = await fetch("/api/admin/category-images/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id }),
      });

      const data = (await res.json()) as { error?: string; asset?: CategoryAssetItem };
      if (!res.ok) {
        throw new Error(data.error || "Failed to select active asset.");
      }

      setCurrentKey(asset.storageKey);
      if (asset.imageUrl) {
        setCurrentUrl(asset.imageUrl);
      }
      if (onImageKeyChange) {
        onImageKeyChange(asset.storageKey);
      }

      setAssets((prev) =>
        prev.map((a) => ({
          ...a,
          isSelected: a.id === asset.id,
        })),
      );

      router?.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setActionPendingId(null);
    }
  }

  async function handleDelete(asset: CategoryAssetItem) {
    if (!window.confirm("Are you sure you want to delete this asset?")) {
      return;
    }

    setError(null);
    setActionPendingId(asset.id);

    try {
      const res = await fetch(
        `/api/admin/category-images/assets?id=${encodeURIComponent(asset.id)}`,
        {
          method: "DELETE",
        },
      );

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete asset.");
      }

      const remaining = assets.filter((a) => a.id !== asset.id);
      setAssets(remaining);

      // If the deleted asset was the active one, fallback to the next candidate or clear
      if (asset.isSelected || asset.storageKey === currentKey) {
        if (remaining.length > 0) {
          const nextActive = remaining[0];
          nextActive.isSelected = true;
          setCurrentKey(nextActive.storageKey);
          setCurrentUrl(nextActive.imageUrl ?? null);
          if (onImageKeyChange) {
            onImageKeyChange(nextActive.storageKey);
          }
        } else {
          setCurrentKey(null);
          setCurrentUrl(null);
          if (onImageKeyChange) {
            onImageKeyChange("");
          }
        }
      }

      router?.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setActionPendingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        {/* Active Thumbnail Preview */}
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
              {generating ? "Generating with AI…" : "Generate New Candidate"}
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

      {/* Candidate Asset Gallery */}
      {assets.length > 0 && (
        <div className="border-t border-black/10 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-bold text-primary uppercase tracking-wide">
              Generated Candidate Assets ({assets.length})
            </h4>
            <span className="text-[11px] text-primary-muted">
              Select any candidate to activate as the live category icon
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {assets.map((asset) => {
              const isActive = asset.isSelected || asset.storageKey === currentKey;
              const isPending = actionPendingId === asset.id;

              return (
                <div
                  key={asset.id}
                  className={`relative flex flex-col rounded-xl border p-2 text-center transition-all ${
                    isActive
                      ? "border-action bg-action-tint/15 shadow-sm ring-1 ring-action"
                      : "border-black/10 bg-surface-muted/50 hover:border-black/20"
                  }`}
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-surface-muted">
                    {asset.imageUrl ? (
                      <ImageWithFallback
                        src={asset.imageUrl}
                        alt="Candidate asset"
                        width={120}
                        height={120}
                        className="h-full w-full object-cover"
                        fallback={
                          <Icon name="folder-tree" className="h-6 w-6 text-primary-subtle m-auto" />
                        }
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Icon name="folder-tree" className="h-6 w-6 text-primary-subtle" />
                      </div>
                    )}

                    {isActive && (
                      <span className="absolute top-1 right-1 flex items-center gap-1 rounded-full bg-action px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
                        <Icon name="check" className="h-3 w-3" />
                        Active
                      </span>
                    )}

                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white uppercase tracking-wider">
                      {asset.style === "3d-icon" ? "3D Icon" : "Photo"}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-1">
                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() => handleSelect(asset)}
                        disabled={isPending || generating}
                        className="flex-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-primary border border-black/15 hover:bg-black/5 disabled:opacity-50"
                      >
                        {isPending ? "Selecting…" : "Select"}
                      </button>
                    ) : (
                      <span className="flex-1 text-[11px] font-bold text-action py-1">Active</span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDelete(asset)}
                      disabled={isPending || generating}
                      aria-label="Delete candidate asset"
                      title="Delete candidate asset"
                      className="rounded-lg p-1 text-black/50 hover:bg-danger-tint/50 hover:text-danger disabled:opacity-50"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
