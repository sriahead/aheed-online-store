/**
 * #1523 — bulk stock counts on /staff/products: the form contract, its parser and its state.
 *
 * Pure, and deliberately NOT in the "use server" file (features/admin/product-quantities.ts):
 * such a file may export only async functions, and a plain constant there 500s every action in it
 * at runtime (CLAUDE.md, Server Actions).
 *
 * THE FORM. Each list row carries two inputs bound to BULK_QUANTITY_FORM_ID by the `form=`
 * attribute (one form per page, like the bulk-actions bar):
 *   `qty:<productId>`  — the quantity box, as the person left it;
 *   `orig:<productId>` — what the box showed when the page rendered.
 * Only a row whose box differs from its original, and is not blank, is an update. So Save sends the
 * rows someone actually changed, and an untouched page writes nothing. The repository re-reads the
 * stored value anyway, so this is a convenience, not the guard.
 */

export const BULK_QUANTITY_FORM_ID = "bulk-quantity-form";
export const QTY_PREFIX = "qty:";
export const ORIG_PREFIX = "orig:";
/** No grocery line plausibly holds more; a larger number is a typo (an extra zero or a barcode). */
export const MAX_BULK_QUANTITY = 100_000;
/** One page at the largest page size. */
export const MAX_BULK_ROWS = 100;

export interface BulkQuantityState {
  status: "idle" | "ok" | "error";
  message: string;
}

export const initialBulkQuantityState: BulkQuantityState = { status: "idle", message: "" };

export type ParsedBulkQuantities =
  { ok: true; updates: { productId: string; quantity: number }[] } | { ok: false; error: string };

/** Reads the changed rows out of a submitted form. Never throws. */
export function parseBulkQuantityForm(
  entries: Iterable<[string, FormDataEntryValue]>,
): ParsedBulkQuantities {
  const submitted = new Map<string, string>();
  const original = new Map<string, string>();
  for (const [key, value] of entries) {
    if (typeof value !== "string") continue;
    if (key.startsWith(QTY_PREFIX)) submitted.set(key.slice(QTY_PREFIX.length), value.trim());
    else if (key.startsWith(ORIG_PREFIX)) original.set(key.slice(ORIG_PREFIX.length), value.trim());
  }

  const updates: { productId: string; quantity: number }[] = [];
  const invalid: string[] = [];
  for (const [productId, raw] of submitted) {
    if (productId === "" || raw === "" || raw === (original.get(productId) ?? "")) continue;
    // Digits only: "-1", "1.5", "1e3" and "12abc" are refused, not rounded or parseInt-guessed.
    const quantity = /^[0-9]{1,7}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(quantity) || quantity > MAX_BULK_QUANTITY) invalid.push(raw);
    else updates.push({ productId, quantity });
  }

  if (invalid.length > 0) {
    return {
      ok: false,
      error: `Quantities must be whole numbers from 0 to ${MAX_BULK_QUANTITY.toLocaleString("en-GB")}. Check: ${invalid.slice(0, 5).join(", ")}. Nothing was saved.`,
    };
  }
  if (updates.length > MAX_BULK_ROWS) {
    return { ok: false, error: `Save at most ${MAX_BULK_ROWS} products at a time.` };
  }
  return { ok: true, updates };
}

/** The result line staff read after Save. */
export function describeBulkQuantityResult(r: {
  updated: number;
  unchanged: number;
  missing: number;
}): string {
  const parts = [`${r.updated} updated`];
  if (r.unchanged > 0) parts.push(`${r.unchanged} already at that count`);
  if (r.missing > 0) parts.push(`${r.missing} not found (skipped)`);
  return `${parts.join(", ")}.`;
}
