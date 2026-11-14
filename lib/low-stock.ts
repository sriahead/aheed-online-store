/**
 * #1572 — the low-stock rule, in one pure module so the staff list, the reports page and the form
 * parser cannot disagree about it.
 *
 * A product is LOW when its stock is tracked and its count is above zero but at or below its own
 * threshold. Zero is OUT of stock, not also low — the same disjoint split `getCatalogueHealth`
 * (`lib/repositories/reports.ts`) uses, so the two figures add up rather than double-count.
 */

import type { StockMode } from "@/lib/cart-rules";

/** The schema default of both `Inventory.lowStockThreshold` and `VendorConfig.lowStockThreshold`. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 3;

/** The largest store-wide default the form accepts; a bigger number is a typo, not a policy. */
export const MAX_LOW_STOCK_THRESHOLD = 999;

export function isLowStock(stock: {
  stockMode: StockMode;
  quantity: number;
  lowStockThreshold: number;
}): boolean {
  return (
    stock.stockMode === "TRACKED" && stock.quantity > 0 && stock.quantity <= stock.lowStockThreshold
  );
}

/** A submitted store-wide default: a whole number from 0 to MAX_LOW_STOCK_THRESHOLD, else an error. */
export function parseLowStockThreshold(
  raw: FormDataEntryValue | null | undefined,
): { ok: true; value: number } | { ok: false; error: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!/^[0-9]{1,3}$/.test(text)) {
    return {
      ok: false,
      error: `Enter a whole number from 0 to ${MAX_LOW_STOCK_THRESHOLD}.`,
    };
  }
  return { ok: true, value: Number(text) };
}

/** #1572 — the store-default form's result; lives here because a "use server" file exports only functions. */
export interface LowStockDefaultState {
  error: string | null;
  /** The confirmation line after a save, e.g. "Saved. 12 products moved from 3 to 5." */
  message: string | null;
}

export const LOW_STOCK_DEFAULT_IDLE: LowStockDefaultState = { error: null, message: null };

/** The confirmation line for a save that moved `moved` products from `previous` to `value`. */
export function lowStockSavedMessage(previous: number, value: number, moved: number): string {
  if (previous === value) return `No change: the default is already ${value}.`;
  const products = moved === 1 ? "1 product" : `${moved} products`;
  return `Saved. The default is now ${value}; ${products} moved from ${previous} to ${value}.`;
}
