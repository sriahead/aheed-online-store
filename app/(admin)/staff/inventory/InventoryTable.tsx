"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { updateInventoryAction } from "./actions";
import { composePublicUrl } from "@/lib/storage";
import { RESTRICTION_LABELS, STOCK_MODE_LABELS } from "@/lib/product-restriction";
import type { StaffInventoryRow } from "@/lib/repositories/products";
import { Icon } from "@/components/icons/Icon";

type StockStatusFilter =
  "ALL" | "RESTOCK_NEEDED" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNTRACKED";
type SortOption = "STOCK_ASC" | "STOCK_DESC" | "NAME_ASC" | "PRICE_ASC" | "PRICE_DESC";

export function InventoryTable({
  initialItems,
  cdnBaseUrl,
}: {
  initialItems: StaffInventoryRow[];
  cdnBaseUrl: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [localSearch, setLocalSearch] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("STOCK_ASC");

  // Sync server search query with URL params
  const handleServerSearch = (term: string) => {
    setLocalSearch(term);
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set("q", term);
    } else {
      params.delete("q");
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  const restockNeededCount = useMemo(() => {
    return initialItems.filter(
      (item) => item.isRestockNeeded || (item.previousQuantity > 0 && item.quantity === 0),
    ).length;
  }, [initialItems]);

  const filteredAndSortedItems = useMemo(() => {
    let result = [...initialItems];

    // Status filter
    if (statusFilter === "RESTOCK_NEEDED") {
      result = result.filter(
        (item) => item.isRestockNeeded || (item.previousQuantity > 0 && item.quantity === 0),
      );
    } else if (statusFilter === "IN_STOCK") {
      result = result.filter((item) => item.stockStatus === "IN_STOCK");
    } else if (statusFilter === "LOW_STOCK") {
      result = result.filter((item) => item.stockStatus === "LOW_STOCK");
    } else if (statusFilter === "OUT_OF_STOCK") {
      result = result.filter((item) => item.stockStatus === "OUT_OF_STOCK");
    } else if (statusFilter === "UNTRACKED") {
      result = result.filter((item) => item.stockStatus === "UNTRACKED");
    }

    // Local client search refinement across Product Name, SKU, Brand, Category
    const q = localSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          (item.brandName && item.brandName.toLowerCase().includes(q)) ||
          item.categoryName.toLowerCase().includes(q),
      );
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "STOCK_ASC":
          return a.quantity - b.quantity;
        case "STOCK_DESC":
          return b.quantity - a.quantity;
        case "NAME_ASC":
          return a.name.localeCompare(b.name);
        case "PRICE_ASC":
          return a.basePrice - b.basePrice;
        case "PRICE_DESC":
          return b.basePrice - a.basePrice;
        default:
          return 0;
      }
    });

    return result;
  }, [initialItems, statusFilter, localSearch, sortBy]);

  return (
    <div className="mt-6 rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
      {/* Controls Header */}
      <div className="p-4 border-b border-black/10 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between bg-surface-muted/20">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/60"
          />
          <input
            type="text"
            placeholder="Search by product name, SKU, brand, or category..."
            value={localSearch}
            onChange={(e) => handleServerSearch(e.target.value)}
            className="w-full rounded-xl border border-black/20 bg-white py-2 pl-9 pr-4 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => handleServerSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black/60 hover:text-black"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filters and Sorting */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-status" className="text-xs font-semibold text-black/60">
              Status:
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StockStatusFilter)}
              className="rounded-xl border border-black/20 bg-white px-3 py-1.5 text-xs font-medium text-primary focus-visible:border-primary focus-visible:outline-none"
            >
              <option value="ALL">All Items ({initialItems.length})</option>
              <option value="RESTOCK_NEEDED">Restock Needed ({restockNeededCount})</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
              <option value="LOW_STOCK">Low Stock</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="UNTRACKED">Untracked</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="sort-by" className="text-xs font-semibold text-black/60">
              Sort:
            </label>
            <select
              id="sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-xl border border-black/20 bg-white px-3 py-1.5 text-xs font-medium text-primary focus-visible:border-primary focus-visible:outline-none"
            >
              <option value="STOCK_ASC">Stock (Low → High)</option>
              <option value="STOCK_DESC">Stock (High → Low)</option>
              <option value="NAME_ASC">Name (A → Z)</option>
              <option value="PRICE_ASC">Price (Low → High)</option>
              <option value="PRICE_DESC">Price (High → Low)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Restock Attention Banner if Restock Items Exist */}
      {restockNeededCount > 0 && statusFilter !== "RESTOCK_NEEDED" && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-amber-900 font-medium">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span>
              <strong>{restockNeededCount} products</strong> previously had stock but are now
              depleted and need restocking.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter("RESTOCK_NEEDED")}
            className="font-bold text-amber-900 hover:text-amber-950 underline ml-4"
          >
            Show Restock List
          </button>
        </div>
      )}

      {/* Active Filter Pill Bar */}
      <div className="flex items-center justify-between px-6 py-2 bg-surface-muted/30 border-b border-black/10 text-xs text-black/60">
        <div>
          Showing <strong>{filteredAndSortedItems.length}</strong> of {initialItems.length} products
          {statusFilter !== "ALL" && (
            <button
              onClick={() => setStatusFilter("ALL")}
              className="ml-2 font-semibold text-action hover:underline"
            >
              (Clear filter)
            </button>
          )}
        </div>
        <div className="italic text-primary-muted font-medium">
          Shop-floor inventory: Use +/- to adjust stock counts quickly.
        </div>
      </div>

      {/* Table with the 9 Essential Columns */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-muted/60 text-xs font-bold uppercase tracking-wider text-black/60 border-b border-black/10">
            <tr>
              <th className="px-4 py-3.5">Product Name</th>
              <th className="px-4 py-3.5">SKU / Product ID</th>
              <th className="px-4 py-3.5">Brand</th>
              <th className="px-4 py-3.5">Category</th>
              <th className="px-4 py-3.5">Net Content</th>
              <th className="px-4 py-3.5 text-right">Selling Price</th>
              <th className="px-4 py-3.5 text-center">Current Stock</th>
              <th className="px-4 py-3.5 text-center">Previous Stock</th>
              <th className="px-4 py-3.5 text-center">Stock Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {filteredAndSortedItems.map((item) => (
              <InventoryRow key={item.id} item={item} cdnBaseUrl={cdnBaseUrl} />
            ))}
            {filteredAndSortedItems.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-black/60">
                  <p className="font-semibold text-base mb-1">No products match your criteria</p>
                  <p className="text-xs text-black/60">
                    Try adjusting your search terms or filters.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryRow({ item, cdnBaseUrl }: { item: StaffInventoryRow; cdnBaseUrl: string }) {
  const [isUpdating, startTransition] = useTransition();
  const [optimisticQuantity, setOptimisticQuantity] = useState(item.quantity);
  const [error, setError] = useState<string | null>(null);

  const imageUrl = item.primaryImage?.storageKey
    ? composePublicUrl(cdnBaseUrl, item.primaryImage.storageKey)
    : "/placeholder.png";

  const isRestockNeeded =
    item.isRestockNeeded || (item.previousQuantity > 0 && optimisticQuantity === 0);

  const updateQuantity = (delta: number) => {
    const next = Math.max(0, optimisticQuantity + delta);
    setOptimisticQuantity(next);
    setError(null);
    startTransition(async () => {
      const res = await updateInventoryAction(item.id, { quantity: next });
      if (!res.ok) {
        setOptimisticQuantity(optimisticQuantity);
        setError(res.error || "Failed to update stock");
      }
    });
  };

  // Derive display status
  let statusBadge: { label: string; bg: string; text: string };
  if (item.stockMode === "UNTRACKED") {
    statusBadge = { label: "Untracked", bg: "bg-slate-100", text: "text-slate-700" };
  } else if (optimisticQuantity === 0) {
    statusBadge = { label: "Out of Stock", bg: "bg-red-100", text: "text-red-700" };
  } else if (optimisticQuantity <= 5) {
    statusBadge = { label: "Low Stock", bg: "bg-amber-100", text: "text-amber-800" };
  } else {
    statusBadge = { label: "In Stock", bg: "bg-emerald-100", text: "text-emerald-800" };
  }

  return (
    <tr
      className={`transition-colors hover:bg-black/[0.02] ${
        isRestockNeeded
          ? "bg-amber-50/70 border-l-4 border-l-amber-500"
          : "border-l-4 border-l-transparent"
      }`}
    >
      {/* 1. Product Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src={imageUrl}
            alt={item.name}
            className="h-10 w-10 shrink-0 rounded-lg object-cover border border-black/10 bg-white"
          />
          <div className="min-w-0">
            <p className="font-semibold text-black/90 truncate max-w-xs">{item.name}</p>
            {item.restriction !== null && (
              <span className="inline-block mt-0.5 text-[10px] font-bold text-danger">
                {RESTRICTION_LABELS[item.restriction]}
              </span>
            )}
            {error && <p className="text-[10px] text-danger mt-0.5">{error}</p>}
          </div>
        </div>
      </td>

      {/* 2. SKU / Product ID */}
      <td className="px-4 py-3 text-xs font-mono text-black/70">
        <span className="rounded bg-black/5 px-1.5 py-0.5">{item.sku}</span>
      </td>

      {/* 3. Brand */}
      <td className="px-4 py-3 text-xs font-medium text-black/80">
        {item.brandName || <span className="text-black/60 italic">—</span>}
      </td>

      {/* 4. Category */}
      <td className="px-4 py-3 text-xs font-medium text-black/80">{item.categoryName}</td>

      {/* 5. Net Content */}
      <td className="px-4 py-3 text-xs text-black/80">
        {item.netContentLabel || item.unitLabel || <span className="text-black/60 italic">—</span>}
      </td>

      {/* 6. Selling Price */}
      <td className="px-4 py-3 text-right">
        <p className="font-bold text-action text-sm">£{(item.basePrice / 100).toFixed(2)}</p>
      </td>

      {/* 7. Current Stock */}
      <td className="px-4 py-3 text-center">
        {item.stockMode !== "TRACKED" ? (
          <span className="text-xs font-semibold text-black/60">
            {STOCK_MODE_LABELS[item.stockMode]}
          </span>
        ) : (
          <div className="inline-flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => updateQuantity(-1)}
              disabled={isUpdating || optimisticQuantity <= 0}
              className="flex h-6 w-6 items-center justify-center rounded-lg bg-black/5 hover:bg-black/10 disabled:opacity-30 transition-colors"
              title="Decrease stock"
            >
              <Icon name="minus" className="h-3 w-3" />
            </button>
            <span
              className={`min-w-7 text-center font-bold text-sm ${
                optimisticQuantity === 0 ? "text-danger" : "text-primary"
              }`}
            >
              {optimisticQuantity}
            </span>
            <button
              type="button"
              onClick={() => updateQuantity(1)}
              disabled={isUpdating}
              className="flex h-6 w-6 items-center justify-center rounded-lg bg-black/5 hover:bg-black/10 disabled:opacity-30 transition-colors"
              title="Increase stock"
            >
              <Icon name="plus" className="h-3 w-3" />
            </button>
          </div>
        )}
      </td>

      {/* 8. Previous Stock */}
      <td className="px-4 py-3 text-center">
        <div className="inline-flex items-center gap-1 text-xs text-black/70 font-mono">
          <span>{item.previousQuantity}</span>
          {item.previousQuantity > optimisticQuantity && (
            <span
              className="text-red-500 font-bold"
              title={`Decreased by ${item.previousQuantity - optimisticQuantity}`}
            >
              ↓
            </span>
          )}
          {item.previousQuantity < optimisticQuantity && (
            <span
              className="text-emerald-500 font-bold"
              title={`Increased by ${optimisticQuantity - item.previousQuantity}`}
            >
              ↑
            </span>
          )}
        </div>
      </td>

      {/* 9. Stock Status */}
      <td className="px-4 py-3 text-center">
        <div className="flex flex-col items-center gap-1">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadge.bg} ${statusBadge.text}`}
          >
            {statusBadge.label}
          </span>
          {isRestockNeeded && (
            <span className="rounded bg-amber-200 text-amber-900 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
              Restock Needed
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
