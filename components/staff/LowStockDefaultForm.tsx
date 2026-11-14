"use client";

import { useActionState } from "react";
import { saveLowStockDefaultAction } from "@/features/admin/catalogue";
import { LOW_STOCK_DEFAULT_IDLE, MAX_LOW_STOCK_THRESHOLD } from "@/lib/low-stock";

/**
 * #1572 — the store-wide low-stock default on /staff/products, rendered for store admins only.
 * Saving moves every product still on the old default; a product with its own number keeps it.
 */
export function LowStockDefaultForm({ current }: { current: number }) {
  const [state, action, pending] = useActionState(
    saveLowStockDefaultAction,
    LOW_STOCK_DEFAULT_IDLE,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
        Low-stock alert at
        <input
          type="number"
          name="lowStockThreshold"
          inputMode="numeric"
          min={0}
          max={MAX_LOW_STOCK_THRESHOLD}
          step={1}
          required
          defaultValue={current}
          className="w-24 rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-primary"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm font-bold text-primary hover:bg-surface-muted disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save default"}
      </button>
      <p className="basis-full text-xs text-primary-muted">
        A product shows as low stock at or below this count. Changing it also updates every product
        still on the old default; a product with its own number keeps it.
      </p>
      {state.error && (
        <p role="alert" className="basis-full text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="basis-full text-sm font-semibold text-action">
          {state.message}
        </p>
      )}
    </form>
  );
}
