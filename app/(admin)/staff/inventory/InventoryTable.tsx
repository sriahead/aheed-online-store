"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Minus, Plus, Search } from "lucide-react";
import { updateInventoryAction } from "./actions";
import { composePublicUrl } from "@/lib/storage";
import type { StaffInventoryRow } from "@/lib/repositories/products";

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
  const [isPending, startTransition] = useTransition();

  const handleSearch = (term: string) => {
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

  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden mt-6">
      <div className="p-4 border-b border-black/10">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
          <input
            type="text"
            placeholder="Filter inventory by name..."
            defaultValue={searchParams.get("q") ?? ""}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full rounded-xl border border-black/20 py-2 pl-9 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-3 bg-surface-muted/30 border-b border-black/10">
        <p className="text-sm font-semibold text-black/80">Showing {initialItems.length} Items</p>
        <p className="text-sm font-bold italic text-primary/80">Shop-Floor Staff: Toggle live product availability honestly when sold out.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-muted/50 text-xs font-bold uppercase tracking-wider text-black/60">
            <tr>
              <th className="px-6 py-4">Product</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4">Price (Pence / GBP)</th>
              <th className="px-6 py-4">Stock Count</th>
              <th className="px-6 py-4">Live Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {initialItems.map((item) => (
              <InventoryRow key={item.id} item={item} cdnBaseUrl={cdnBaseUrl} />
            ))}
            {initialItems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-black/50">
                  No products found.
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
  const [optimisticActive, setOptimisticActive] = useState(item.isActive);

  const imageUrl = item.primaryImage?.storageKey
    ? composePublicUrl(cdnBaseUrl, item.primaryImage.storageKey)
    : "/placeholder.png";

  const updateQuantity = (delta: number) => {
    const next = Math.max(0, optimisticQuantity + delta);
    setOptimisticQuantity(next);
    startTransition(async () => {
      await updateInventoryAction(item.id, { quantity: next });
    });
  };

  const toggleActive = () => {
    const next = !optimisticActive;
    setOptimisticActive(next);
    startTransition(async () => {
      await updateInventoryAction(item.id, { isActive: next });
    });
  };

  return (
    <tr className="hover:bg-black/[0.02]">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <img
            src={imageUrl}
            alt={item.name}
            className="h-10 w-10 rounded-lg object-cover border border-black/10 bg-white"
          />
          <div>
            <p className="font-bold text-black/90">{item.name}</p>
            <p className="text-xs text-black/50">{item.unitLabel}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="font-bold text-black/60 uppercase text-xs tracking-wider">
          {item.categoryName}
        </span>
      </td>
      <td className="px-6 py-4">
        <p className="font-bold text-[#2e7d32]">£{(item.basePrice / 100).toFixed(2)}</p>
        <p className="text-xs text-black/40">({item.basePrice}p)</p>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => updateQuantity(-1)}
            disabled={isUpdating || optimisticQuantity <= 0}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-black/5 hover:bg-black/10 disabled:opacity-50"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-6 text-center font-bold">{optimisticQuantity}</span>
          <button
            onClick={() => updateQuantity(1)}
            disabled={isUpdating}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-black/5 hover:bg-black/10 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </td>
      <td className="px-6 py-4">
        <button
          onClick={toggleActive}
          disabled={isUpdating}
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
            optimisticActive
              ? "bg-[#e8f5e9] text-[#2e7d32] hover:bg-[#c8e6c9]"
              : "bg-red-100 text-red-700 hover:bg-red-200"
          }`}
        >
          {optimisticActive ? (
            <>
              <Eye className="h-3.5 w-3.5" />
              In Stock
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              Hidden
            </>
          )}
        </button>
      </td>
    </tr>
  );
}
