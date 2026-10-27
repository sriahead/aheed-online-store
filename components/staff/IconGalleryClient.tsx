"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { IconMedallion } from "@/components/icons/IconMedallion";
import { FLAT_ICON_SLOTS, ICON_3D_SLOTS } from "@/lib/icon-slots";
import type { CategoryAssetItem } from "@/components/staff/CategoryImageManager";
import type { CategoryImageStyle } from "@/lib/category-image";

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

export interface IconGalleryClientProps {
  initialAssets: CategoryAssetItem[];
  categories: CategoryOption[];
  /**
   * #1288 R7: only an admin can generate, activate, deactivate or delete — the routes behind those
   * controls are ADMIN-only, so a STAFF viewer gets the library read-only instead of buttons that 403.
   */
  canManage: boolean;
}

/** Flat (Noto) icon slots are stored as `icon:<name>`; 3D system slots are bare names. */
function isFlatSlot(slot: string | null | undefined): boolean {
  return Boolean(slot?.startsWith("icon:"));
}

/** Card and modal previews show the asset in the same circle shoppers see (#1288 R17). */
const CARD_MEDALLION_SIZE = 120;
const PREVIEW_MEDALLION_SIZE = 320;

function useOptionalRouter() {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

export function IconGalleryClient({
  initialAssets,
  categories,
  canManage,
}: IconGalleryClientProps) {
  const [assets, setAssets] = useState<CategoryAssetItem[]>(initialAssets);
  const [filterTab, setFilterTab] = useState<"all" | "categories" | "slots" | "flat">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAssetForPreview, setSelectedAssetForPreview] = useState<CategoryAssetItem | null>(
    null,
  );

  // Quick generator state
  const [targetType, setTargetType] = useState<"category" | "slot">("category");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categories[0]?.id || "");
  const [selectedSlotId, setSelectedSlotId] = useState<string>(ICON_3D_SLOTS[0].id);
  const [genStyle, setGenStyle] = useState<CategoryImageStyle>("photo");
  const [generating, setGenerating] = useState(false);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const router = useOptionalRouter();

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (filterTab === "categories" && !asset.categoryId) return false;
      if (filterTab === "slots" && (!asset.slot || isFlatSlot(asset.slot))) return false;
      if (filterTab === "flat" && !isFlatSlot(asset.slot)) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();

      const catName = asset.category?.name?.toLowerCase() || "";
      const slotName = asset.slot?.toLowerCase() || "";
      const keyName = asset.storageKey.toLowerCase();

      return catName.includes(q) || slotName.includes(q) || keyName.includes(q);
    });
  }, [assets, filterTab, searchQuery]);

  async function handleGenerate() {
    setStatusMessage(null);
    setGenerating(true);

    try {
      const payload: { categoryId?: string; slot?: string; style: CategoryImageStyle } = {
        style: genStyle,
      };

      if (targetType === "category") {
        if (!selectedCategoryId) throw new Error("Please select a category");
        payload.categoryId = selectedCategoryId;
      } else {
        payload.slot = selectedSlotId;
      }

      const res = await fetch("/api/admin/category-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        error?: string;
        imageKey?: string;
        imageUrl?: string;
        asset?: CategoryAssetItem;
      };

      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }

      if (data.asset && data.imageUrl) {
        const newAsset: CategoryAssetItem = {
          ...data.asset,
          imageUrl: data.imageUrl,
          isSelected: true,
        };

        // Update local list
        setAssets((prev) => [
          newAsset,
          ...prev.map((a) => {
            if (
              (targetType === "category" && a.categoryId === selectedCategoryId) ||
              (targetType === "slot" && a.slot === selectedSlotId)
            ) {
              return { ...a, isSelected: false };
            }
            return a;
          }),
        ]);

        setStatusMessage({
          type: "success",
          text: `Asset generated successfully and set as active for ${
            targetType === "category"
              ? categories.find((c) => c.id === selectedCategoryId)?.name
              : selectedSlotId
          }.`,
        });
        router?.refresh();
      }
    } catch (cause) {
      setStatusMessage({
        type: "error",
        text: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSelect(asset: CategoryAssetItem) {
    setStatusMessage(null);
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

      setAssets((prev) =>
        prev.map((a) => {
          if (asset.categoryId && a.categoryId === asset.categoryId) {
            return { ...a, isSelected: a.id === asset.id };
          }
          if (asset.slot && a.slot === asset.slot) {
            return { ...a, isSelected: a.id === asset.id };
          }
          return a;
        }),
      );

      setStatusMessage({
        type: "success",
        text: "Asset activated successfully.",
      });
      router?.refresh();
    } catch (cause) {
      setStatusMessage({
        type: "error",
        text: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setActionPendingId(null);
    }
  }

  // #1288 R4: switch the active asset off; the surface falls back to its built-in artwork.
  async function handleDeactivate(asset: CategoryAssetItem) {
    setStatusMessage(null);
    setActionPendingId(asset.id);

    try {
      const res = await fetch("/api/admin/category-images/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to deactivate asset.");
      }

      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, isSelected: false } : a)));
      setSelectedAssetForPreview((prev) =>
        prev?.id === asset.id ? { ...prev, isSelected: false } : prev,
      );

      setStatusMessage({
        type: "success",
        text: "Asset deactivated. The built-in artwork is shown again.",
      });
      router?.refresh();
    } catch (cause) {
      setStatusMessage({
        type: "error",
        text: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setActionPendingId(null);
    }
  }

  async function handleDelete(asset: CategoryAssetItem) {
    if (
      !window.confirm(
        "Are you sure you want to permanently delete this asset from storage and catalog?",
      )
    ) {
      return;
    }

    setStatusMessage(null);
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

      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      if (selectedAssetForPreview?.id === asset.id) {
        setSelectedAssetForPreview(null);
      }

      setStatusMessage({
        type: "success",
        text: "Asset deleted permanently.",
      });
      router?.refresh();
    } catch (cause) {
      setStatusMessage({
        type: "error",
        text: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setActionPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {!canManage && (
        <p className="rounded-xl border border-black/10 bg-surface-muted px-3 py-2 text-xs text-primary-muted">
          Only an admin can generate or change visual assets.
        </p>
      )}

      {/* Quick Generator Panel */}
      {canManage && (
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Icon name="sparkles" className="h-5 w-5 text-amber-500" />
            <h2 className="text-sm font-bold text-primary">Generate New Asset</h2>
            <span className="text-xs text-primary-muted ml-auto">
              Metred via Cloudflare Workers AI
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <span className="block text-xs font-semibold text-primary-muted mb-1">
                Asset Target:
              </span>
              <div className="flex rounded-lg border border-black/15 p-0.5 bg-surface-muted">
                <button
                  type="button"
                  onClick={() => {
                    setTargetType("category");
                  }}
                  className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                    targetType === "category" ? "bg-white text-primary shadow-sm" : "text-black/60"
                  }`}
                >
                  Category
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetType("slot");
                    setGenStyle("3d-icon");
                  }}
                  className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                    targetType === "slot" ? "bg-white text-primary shadow-sm" : "text-black/60"
                  }`}
                >
                  System Icon
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="quick-gen-target-select"
                className="block text-xs font-semibold text-primary-muted mb-1"
              >
                {targetType === "category" ? "Department:" : "Icon Slot:"}
              </label>
              {targetType === "category" ? (
                <select
                  id="quick-gen-target-select"
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  disabled={generating}
                  className="w-full rounded-lg border border-black/15 bg-surface-muted px-2.5 py-1.5 text-xs font-medium text-primary focus:border-action focus:outline-none"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.slug})
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  id="quick-gen-target-select"
                  value={selectedSlotId}
                  onChange={(e) => setSelectedSlotId(e.target.value)}
                  disabled={generating}
                  className="w-full rounded-lg border border-black/15 bg-surface-muted px-2.5 py-1.5 text-xs font-medium text-primary focus:border-action focus:outline-none"
                >
                  <optgroup label="3D icons">
                    {ICON_3D_SLOTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Flat icons">
                    {FLAT_ICON_SLOTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              )}
            </div>

            <div>
              <label
                htmlFor="quick-gen-style-select"
                className="block text-xs font-semibold text-primary-muted mb-1"
              >
                Visual Preset:
              </label>
              <select
                id="quick-gen-style-select"
                value={genStyle}
                onChange={(e) => setGenStyle(e.target.value as CategoryImageStyle)}
                disabled={generating}
                className="w-full rounded-lg border border-black/15 bg-surface-muted px-2.5 py-1.5 text-xs font-medium text-primary focus:border-action focus:outline-none"
              >
                <option value="photo">Studio Product Photography</option>
                <option value="3d-icon">Commercial 3D Rendered Icon</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-action px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-action-hover disabled:opacity-50"
              >
                <Icon
                  name="sparkles"
                  className={`h-4 w-4 ${generating ? "animate-spin" : "text-amber-300"}`}
                />
                {generating ? "Generating…" : "Generate & Add to Library"}
              </button>
            </div>
          </div>

          {statusMessage && (
            <div
              role="alert"
              className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                statusMessage.type === "success"
                  ? "border-action/30 bg-action-tint/30 text-action"
                  : "border-danger/30 bg-danger-tint/60 text-danger"
              }`}
            >
              {statusMessage.text}
            </div>
          )}
        </div>
      )}

      {/* Library Controls: Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex rounded-xl border border-black/10 bg-white p-1">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filterTab === "all" ? "bg-primary text-white" : "text-black/70 hover:bg-black/5"
            }`}
          >
            All Assets ({assets.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("categories")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filterTab === "categories"
                ? "bg-primary text-white"
                : "text-black/70 hover:bg-black/5"
            }`}
          >
            Category Imagery ({assets.filter((a) => a.categoryId).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("slots")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filterTab === "slots" ? "bg-primary text-white" : "text-black/70 hover:bg-black/5"
            }`}
          >
            System Icons ({assets.filter((a) => a.slot && !isFlatSlot(a.slot)).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("flat")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filterTab === "flat" ? "bg-primary text-white" : "text-black/70 hover:bg-black/5"
            }`}
          >
            Flat icons ({assets.filter((a) => isFlatSlot(a.slot)).length})
          </button>
        </div>

        <div className="relative sm:w-64">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary-subtle"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets…"
            className="w-full rounded-xl border border-black/15 bg-white py-1.5 pl-8 pr-3 text-xs text-primary placeholder:text-primary-subtle focus:border-action focus:outline-none"
          />
        </div>
      </div>

      {/* Asset Grid */}
      {filteredAssets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/15 bg-white p-12 text-center">
          <IconMedallion icon="folder-tree" size={32} className="mx-auto mb-2" decorative />
          <h3 className="text-sm font-bold text-primary">No visual assets found</h3>
          <p className="text-xs text-primary-muted mt-1">
            Generate candidate images using the generator above or check category settings.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredAssets.map((asset) => {
            const isPending = actionPendingId === asset.id;
            const targetLabel = asset.category?.name || asset.slot || "Unassigned";

            return (
              <div
                key={asset.id}
                className={`group relative flex flex-col rounded-2xl border bg-white p-2.5 transition-all shadow-sm ${
                  asset.isSelected
                    ? "border-action ring-2 ring-action/20"
                    : "border-black/10 hover:border-black/25 hover:shadow-md"
                }`}
              >
                {/* Image Surface with Click to Preview */}
                <button
                  type="button"
                  onClick={() => setSelectedAssetForPreview(asset)}
                  className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-surface-muted focus:outline-none focus:ring-2 focus:ring-action"
                  title="Click to preview full asset"
                >
                  {asset.imageUrl ? (
                    <IconMedallion
                      imageUrl={asset.imageUrl}
                      fallbackIcon="folder-tree"
                      size={CARD_MEDALLION_SIZE}
                      label={targetLabel}
                      loading="lazy"
                      className="transition-transform group-hover:scale-105 motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <IconMedallion icon="folder-tree" size={CARD_MEDALLION_SIZE} decorative />
                  )}

                  {asset.isSelected && (
                    <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-action px-2 py-0.5 text-[10px] font-bold text-white shadow">
                      <Icon name="check" className="h-3 w-3" />
                      Active
                    </span>
                  )}

                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white uppercase tracking-wider">
                    {asset.style === "3d-icon" ? "3D Icon" : "Photo"}
                  </span>
                </button>

                {/* Metadata & Actions */}
                <div className="mt-2.5 flex flex-col flex-1 justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-primary truncate" title={targetLabel}>
                      {targetLabel}
                    </h4>
                    <p className="text-[10px] text-primary-muted truncate font-mono">
                      {asset.storageKey.split("/").pop()}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-1 pt-2 border-t border-black/5">
                    {!canManage ? (
                      <span className="flex-1 text-[11px] font-bold text-primary-muted py-1 text-center">
                        {asset.isSelected ? "Active" : "Inactive"}
                      </span>
                    ) : !asset.isSelected ? (
                      <button
                        type="button"
                        onClick={() => handleSelect(asset)}
                        disabled={isPending || generating}
                        className="flex-1 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 disabled:opacity-50"
                      >
                        {isPending ? "Selecting…" : "Activate"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(asset)}
                        disabled={isPending || generating}
                        className="flex-1 rounded-lg border border-black/15 bg-white px-2 py-1 text-[11px] font-bold text-primary hover:bg-black/5 disabled:opacity-50"
                      >
                        {isPending ? "Deactivating…" : "Deactivate"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedAssetForPreview(asset)}
                      title="Inspect asset"
                      className="rounded-lg p-1 text-black/60 hover:bg-black/5 hover:text-black"
                    >
                      <Icon name="eye" className="h-3.5 w-3.5" />
                    </button>

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleDelete(asset)}
                        disabled={isPending || generating}
                        aria-label="Delete asset"
                        title="Delete asset"
                        className="rounded-lg p-1 text-black/60 hover:bg-danger-tint/50 hover:text-danger disabled:opacity-50"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* High-Resolution Preview Modal */}
      {selectedAssetForPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-preview-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop button */}
          <button
            type="button"
            aria-label="Close dialog"
            onClick={() => setSelectedAssetForPreview(null)}
            className="fixed inset-0 bg-black/60 cursor-default"
          />
          <div className="relative z-10 w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/10 pb-3">
              <div>
                <h3 id="asset-preview-modal-title" className="text-base font-bold text-primary">
                  {selectedAssetForPreview.category?.name ||
                    selectedAssetForPreview.slot ||
                    "Asset Preview"}
                </h3>
                <span className="text-xs text-primary-muted uppercase font-semibold">
                  Style: {selectedAssetForPreview.style}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAssetForPreview(null)}
                className="rounded-full p-1.5 text-black/60 hover:bg-black/5"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>

            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-surface-muted flex items-center justify-center">
              {selectedAssetForPreview.imageUrl ? (
                <IconMedallion
                  imageUrl={selectedAssetForPreview.imageUrl}
                  fallbackIcon="folder-tree"
                  size={PREVIEW_MEDALLION_SIZE}
                  label="High resolution preview"
                />
              ) : (
                <IconMedallion icon="folder-tree" size={PREVIEW_MEDALLION_SIZE} decorative />
              )}
            </div>

            <div className="space-y-1 text-xs text-primary-muted font-mono bg-surface-muted p-3 rounded-xl break-all">
              <div>
                <strong className="text-primary font-sans">Storage Key:</strong>{" "}
                {selectedAssetForPreview.storageKey}
              </div>
              <div>
                <strong className="text-primary font-sans">Created:</strong>{" "}
                {new Date(selectedAssetForPreview.createdAt).toLocaleString()}
              </div>
              <div>
                <strong className="text-primary font-sans">Status:</strong>{" "}
                {selectedAssetForPreview.isSelected ? "Active Primary" : "Candidate"}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {canManage && !selectedAssetForPreview.isSelected && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelect(selectedAssetForPreview);
                    setSelectedAssetForPreview(null);
                  }}
                  className="rounded-xl bg-action px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-action-hover"
                >
                  Activate Asset
                </button>
              )}
              {canManage && selectedAssetForPreview.isSelected && (
                <button
                  type="button"
                  onClick={() => handleDeactivate(selectedAssetForPreview)}
                  className="rounded-xl border border-black/15 bg-white px-4 py-2 text-xs font-bold text-primary hover:bg-black/5"
                >
                  Deactivate Asset
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleDelete(selectedAssetForPreview)}
                  className="rounded-xl border border-danger/30 bg-danger-tint/30 px-4 py-2 text-xs font-bold text-danger hover:bg-danger-tint/60"
                >
                  Delete Asset
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedAssetForPreview(null)}
                className="rounded-xl border border-black/15 bg-white px-4 py-2 text-xs font-semibold text-primary hover:bg-black/5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
