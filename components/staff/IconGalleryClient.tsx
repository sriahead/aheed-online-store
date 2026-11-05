"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { IconMedallion } from "@/components/icons/IconMedallion";
import {
  FLAT_ICON_SLOTS,
  ICON_3D_SLOTS,
  ICON_SLOTS,
  getIconSlot,
  type IconSlotGroup,
} from "@/lib/icon-slots";
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

/** Resolves human-readable surfaces where this asset renders in the storefront or admin. */
function getSurfacesForAsset(asset: CategoryAssetItem): readonly string[] {
  if (asset.slot) {
    const slot = getIconSlot(asset.slot);
    return slot?.surfaces ?? ["Storefront & Staff interface"];
  }
  if (asset.categoryId) {
    return ["Storefront Category Navigation", "Department scroller & browse page headers"];
  }
  return [];
}

/** Card and modal previews show the asset in the same circle shoppers see (#1288 R17). */
const CARD_MEDALLION_SIZE = 120;
const PREVIEW_MEDALLION_SIZE = 320;

const SLOT_GROUP_FILTERS: { id: "all" | IconSlotGroup; label: string }[] = [
  { id: "all", label: "All Slots" },
  { id: "Fulfilment & Delivery", label: "Fulfilment & Delivery" },
  { id: "Trust & Security", label: "Trust & Security" },
  { id: "Storefront & Navigation", label: "Navigation & Storefront" },
  { id: "Subcategories & Produce", label: "Subcategories & Produce" },
  { id: "Account & Orders", label: "Account & Orders" },
  { id: "Rewards & Loyalty", label: "Rewards & Loyalty" },
  { id: "Staff & Operations", label: "Staff & Operations" },
  { id: "General UI", label: "General UI" },
];

const LIBRARY_GROUP_FILTERS: { id: "all" | IconSlotGroup | "departments"; label: string }[] = [
  { id: "all", label: "All Groups" },
  { id: "departments", label: "Departments" },
  { id: "Fulfilment & Delivery", label: "Fulfilment & Delivery" },
  { id: "Trust & Security", label: "Trust & Security" },
  { id: "Storefront & Navigation", label: "Navigation & Storefront" },
  { id: "Subcategories & Produce", label: "Subcategories & Produce" },
  { id: "Account & Orders", label: "Account & Orders" },
  { id: "Rewards & Loyalty", label: "Rewards & Loyalty" },
  { id: "Staff & Operations", label: "Staff & Operations" },
];

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
  const [libraryGroupFilter, setLibraryGroupFilter] = useState<
    "all" | IconSlotGroup | "departments"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAssetForPreview, setSelectedAssetForPreview] = useState<CategoryAssetItem | null>(
    null,
  );

  // Quick generator state
  const [targetType, setTargetType] = useState<"category" | "slot">("category");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categories[0]?.id || "");
  const [selectedSlotId, setSelectedSlotId] = useState<string>(ICON_3D_SLOTS[0].id);
  const [slotCategoryFilter, setSlotCategoryFilter] = useState<"all" | IconSlotGroup>("all");
  const [targetSearchQuery, setTargetSearchQuery] = useState("");
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

      if (libraryGroupFilter !== "all") {
        if (libraryGroupFilter === "departments") {
          if (!asset.categoryId) return false;
        } else {
          if (!asset.slot) return false;
          const slot = getIconSlot(asset.slot);
          if (slot?.group !== libraryGroupFilter) return false;
        }
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();

      const catName = asset.category?.name?.toLowerCase() || "";
      const slotName = asset.slot?.toLowerCase() || "";
      const slot = asset.slot ? getIconSlot(asset.slot) : undefined;
      const slotLabel = slot?.label.toLowerCase() || "";
      const slotGroup = slot?.group.toLowerCase() || "";
      const keyName = asset.storageKey.toLowerCase();
      const surfacesText = getSurfacesForAsset(asset).join(" ").toLowerCase();

      return (
        catName.includes(q) ||
        slotName.includes(q) ||
        slotLabel.includes(q) ||
        slotGroup.includes(q) ||
        keyName.includes(q) ||
        surfacesText.includes(q)
      );
    });
  }, [assets, filterTab, libraryGroupFilter, searchQuery]);

  const filteredSlots = useMemo(() => {
    return ICON_SLOTS.filter((slot) => {
      if (slotCategoryFilter !== "all" && slot.group !== slotCategoryFilter) {
        return false;
      }
      if (!targetSearchQuery.trim()) return true;
      const q = targetSearchQuery.toLowerCase().trim();
      const matchLabel = slot.label.toLowerCase().includes(q);
      const matchId = slot.id.toLowerCase().includes(q);
      const matchGroup = slot.group.toLowerCase().includes(q);
      const matchSurfaces = slot.surfaces.some((s) => s.toLowerCase().includes(q));
      return matchLabel || matchId || matchGroup || matchSurfaces;
    });
  }, [slotCategoryFilter, targetSearchQuery]);

  const filteredCategories = useMemo(() => {
    if (!targetSearchQuery.trim()) return categories;
    const q = targetSearchQuery.toLowerCase().trim();
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
  }, [categories, targetSearchQuery]);

  const selectedSlot = useMemo(() => {
    return getIconSlot(selectedSlotId);
  }, [selectedSlotId]);

  const currentTargetSurfaces = useMemo(() => {
    if (targetType === "category") {
      const cat = categories.find((c) => c.id === selectedCategoryId);
      return [
        `Storefront Category Navigation: ${cat ? cat.name : "Selected department"}`,
        "Department scroller & browse page headers",
      ];
    }
    const slot = getIconSlot(selectedSlotId);
    return slot?.surfaces ?? ["Storefront & Staff interface"];
  }, [targetType, selectedCategoryId, selectedSlotId, categories]);

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

          {/* Generator Controls */}
          <div className="space-y-3">
            {/* Target Type & Search Header */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div>
                <span className="block text-xs font-semibold text-primary-muted mb-1">
                  Asset Target:
                </span>
                <div className="flex rounded-lg border border-black/15 p-0.5 bg-surface-muted">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetType("category");
                      setTargetSearchQuery("");
                    }}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                      targetType === "category"
                        ? "bg-white text-primary shadow-sm"
                        : "text-black/60"
                    }`}
                  >
                    Category
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetType("slot");
                      setTargetSearchQuery("");
                    }}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                      targetType === "slot" ? "bg-white text-primary shadow-sm" : "text-black/60"
                    }`}
                  >
                    System Icon
                  </button>
                </div>
              </div>

              <div className="flex-1">
                <label
                  htmlFor="quick-gen-target-search"
                  className="block text-xs font-semibold text-primary-muted mb-1"
                >
                  Quick Search Target:
                </label>
                <div className="relative">
                  <Icon
                    name="search"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary-subtle"
                  />
                  <input
                    id="quick-gen-target-search"
                    type="text"
                    value={targetSearchQuery}
                    onChange={(e) => setTargetSearchQuery(e.target.value)}
                    placeholder={
                      targetType === "category"
                        ? "Search department (e.g. bakery, halal, fruit)..."
                        : "Search icon or surface (e.g. delivery, collect, all, halal, meat, shield)..."
                    }
                    className="w-full rounded-lg border border-black/15 bg-surface-muted py-1.5 pl-8 pr-7 text-xs text-primary placeholder:text-primary-subtle focus:border-action focus:bg-white focus:outline-none"
                  />
                  {targetSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTargetSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-black/60 hover:text-black"
                      aria-label="Clear target search"
                    >
                      <Icon name="x" className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Target Category Pills (for slots) */}
            {targetType === "slot" && (
              <div>
                <span className="block text-[11px] font-semibold text-primary-muted mb-1">
                  Categorise by Function:
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  {SLOT_GROUP_FILTERS.map((gf) => {
                    const isSelected = slotCategoryFilter === gf.id;
                    const count =
                      gf.id === "all"
                        ? ICON_SLOTS.length
                        : ICON_SLOTS.filter((s) => s.group === gf.id).length;
                    return (
                      <button
                        key={gf.id}
                        type="button"
                        onClick={() => setSlotCategoryFilter(gf.id)}
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                          isSelected
                            ? "bg-primary text-white shadow-xs"
                            : "bg-surface-muted border border-black/10 text-black/70 hover:bg-black/5"
                        }`}
                      >
                        {gf.label} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Filtered Quick-Select Strip (when search or group filter is active) */}
            {(targetSearchQuery.trim() ||
              (targetType === "slot" && slotCategoryFilter !== "all")) && (
              <div className="rounded-xl border border-action/20 bg-action-tint/10 p-2.5">
                <div className="mb-1.5 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-action">
                    Matching Targets (
                    {targetType === "category" ? filteredCategories.length : filteredSlots.length}):
                  </span>
                  <span className="text-primary-muted">Click an icon below to select it</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {targetType === "category" ? (
                    filteredCategories.length === 0 ? (
                      <span className="text-xs text-primary-muted py-1">
                        No matching departments found
                      </span>
                    ) : (
                      filteredCategories.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCategoryId(c.id)}
                          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                            selectedCategoryId === c.id
                              ? "border-action bg-white text-action ring-2 ring-action/20 shadow-xs"
                              : "border-black/10 bg-white text-primary hover:border-black/30"
                          }`}
                        >
                          <span className="truncate max-w-[150px]">{c.name}</span>
                        </button>
                      ))
                    )
                  ) : filteredSlots.length === 0 ? (
                    <span className="text-xs text-primary-muted py-1">No matching icons found</span>
                  ) : (
                    filteredSlots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSlotId(s.id)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                          selectedSlotId === s.id
                            ? "border-action bg-white text-action ring-2 ring-action/20 shadow-xs"
                            : "border-black/10 bg-white text-primary hover:border-black/30"
                        }`}
                        title={`${s.label} (${s.surfaces.join(", ")})`}
                      >
                        {s.kind === "3d" ? (
                          <IconMedallion icon3d={s.icon3d as any} size={18} decorative />
                        ) : (
                          <IconMedallion icon={s.iconName} size={18} decorative />
                        )}
                        <span className="truncate max-w-[140px]">{s.label}</span>
                        <span className="rounded bg-black/5 px-1 py-0.2 text-[9px] font-normal text-black/60">
                          {s.group.split(" ")[0]}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Target Selector Dropdown, Style Preset & Generate Button */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              <div className="sm:col-span-2">
                <label
                  htmlFor="quick-gen-target-select"
                  className="block text-xs font-semibold text-primary-muted mb-1"
                >
                  {targetType === "category" ? "Target Department:" : "Target System Icon Slot:"}
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
                        {c.name} ({c.slug}) — Storefront Category Navigation
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
                          {s.label} [{s.group}] ({s.surfaces.join(", ")})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Flat icons">
                      {FLAT_ICON_SLOTS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} [{s.group}] ({s.surfaces.join(", ")})
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
                  <option value="photo">Studio Product Photography (Recommended)</option>
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

            {/* Live Selected Target Details Card */}
            <div className="flex items-start gap-3 rounded-xl border border-black/10 bg-surface-muted p-3">
              <div className="shrink-0 pt-0.5">
                {targetType === "category" ? (
                  <IconMedallion icon="folder-tree" size={36} decorative />
                ) : selectedSlot?.kind === "3d" ? (
                  <IconMedallion icon3d={selectedSlot.icon3d as any} size={36} decorative />
                ) : (
                  <IconMedallion
                    icon={selectedSlot?.iconName ?? "folder-tree"}
                    size={36}
                    decorative
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-primary">
                    {targetType === "category"
                      ? categories.find((c) => c.id === selectedCategoryId)?.name
                      : selectedSlot?.label}
                  </span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {targetType === "category" ? "Departments & Navigation" : selectedSlot?.group}
                  </span>
                  <span className="text-[10px] text-primary-muted font-mono">
                    ID: {targetType === "category" ? selectedCategoryId : selectedSlotId}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-primary">
                    Storefront surfaces:
                  </span>
                  {currentTargetSurfaces.map((surface, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-white border border-black/10 px-1.5 py-0.5 text-[9px] font-medium text-black/70"
                    >
                      📍 {surface}
                    </span>
                  ))}
                </div>
              </div>
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

      {/* Library Controls: Tabs, Category Filters & Search */}
      <div className="space-y-3">
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
              placeholder="Search library assets…"
              className="w-full rounded-xl border border-black/15 bg-white py-1.5 pl-8 pr-3 text-xs text-primary placeholder:text-primary-subtle focus:border-action focus:outline-none"
            />
          </div>
        </div>

        {/* Group Filter Pills for Library */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {LIBRARY_GROUP_FILTERS.map((f) => {
            const isSelected = libraryGroupFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setLibraryGroupFilter(f.id)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-primary text-white shadow-xs"
                    : "bg-white border border-black/10 text-black/70 hover:bg-black/5"
                }`}
              >
                {f.label}
              </button>
            );
          })}
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
                    {(() => {
                      const surfaces = getSurfacesForAsset(asset);
                      if (surfaces.length === 0) return null;
                      return (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {surfaces.slice(0, 2).map((surface, idx) => (
                            <span
                              key={idx}
                              className="inline-block rounded bg-primary/5 px-1.5 py-0.5 text-[9px] font-medium text-primary-muted truncate max-w-full"
                              title={surface}
                            >
                              📍 {surface}
                            </span>
                          ))}
                          {surfaces.length > 2 && (
                            <span
                              className="inline-block rounded bg-primary/5 px-1 py-0.5 text-[9px] font-medium text-primary-muted"
                              title={surfaces.slice(2).join("; ")}
                            >
                              +{surfaces.length - 2}
                            </span>
                          )}
                        </div>
                      );
                    })()}
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
              <div className="pt-2 border-t border-black/10">
                <strong className="text-primary font-sans">Storefront Surface Mapping:</strong>
                <div className="mt-1 flex flex-wrap gap-1 font-sans">
                  {getSurfacesForAsset(selectedAssetForPreview).map((surface, idx) => (
                    <span
                      key={idx}
                      className="inline-block rounded-md bg-white border border-black/15 px-2 py-0.5 text-[11px] font-medium text-primary"
                    >
                      📍 {surface}
                    </span>
                  ))}
                </div>
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
