/**
 * Saved shopping lists (P10, #116) — pure, no I/O, no Prisma import, so the whole of it is
 * unit-testable without a database (same split as `lib/shopping-list.ts`, `lib/cart-rules.ts`
 * and `lib/order-status.ts`).
 *
 * This module owns the conversion between a `ParsedLine` — the shape the whole "Shop your list"
 * pipeline already speaks — and the rows persisted in `ShoppingListItem`. Everything that decides
 * what a saved line means lives here; `lib/repositories/shopping-lists.ts` only reads and writes.
 *
 * ## The round trip is the contract
 *
 * `itemsToLines(linesToItems(lines))` must return the lines it was given. That is what lets a
 * saved list re-enter `resolveLines()` as though the shopper had just pasted it, which is the
 * entire design: no matching logic is duplicated for saved lists, because a saved list IS a
 * parsed list that happens to have been written down.
 */

import { MAX_LINE_QUANTITY, MAX_LIST_LINES, toTerms, type ParsedLine } from "@/lib/shopping-list";

/**
 * How many lists one shopper may keep per vendor.
 *
 * A cap exists because nothing else bounds this table: a list is free to create and never
 * expires, so without a ceiling one account can grow it without limit. Twenty is chosen to be far
 * above any plausible real use (a weekly shop, a party list, a store-cupboard restock) and far
 * below anything that would make `/account/lists` unreadable or the count query interesting.
 */
export const MAX_SAVED_LISTS = 20;

/** Longest a list name may be once normalised. Long enough to be descriptive, short enough to render on one line on a phone. */
export const MAX_LIST_NAME_LENGTH = 60;

/**
 * Why a save ended the way it did. `capped` and `empty` are ordinary outcomes the shopper needs
 * told about, not errors — a save refused silently is the worse bug (R29a).
 */
export type SaveListOutcome = "idle" | "saved" | "capped" | "empty";

/**
 * The save form's state on /shop-your-list.
 *
 * It lives here rather than beside the action because a `"use server"` module may only export
 * async functions — a plain const or type export there is enforced at RUNTIME, so `build`,
 * `typecheck` and `test` all stay green while every action in the file 500s for every caller
 * (#159). Same reason, same shape, as `MatchListState` in `lib/shopping-list.ts`.
 */
export interface SaveListState {
  outcome: SaveListOutcome;
  /** The saved list's name, for the confirmation line. Set only when `outcome` is `saved`. */
  name?: string;
}

export const EMPTY_SAVE_STATE: SaveListState = { outcome: "idle" };

/** One persisted line, as written. `position` is assigned by `linesToItems`, never by the caller. */
export interface SavedListItemInput {
  rawText: string;
  terms: string;
  quantity: number;
  measure: string | null;
  brand: string | null;
  position: number;
}

/** One persisted line, as read back. Structurally what the repository selects. */
export interface SavedListItemRow {
  rawText: string;
  terms: string;
  quantity: number;
  measure: string | null;
  brand: string | null;
  position: number;
}

function clampQuantity(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.trunc(value), MAX_LINE_QUANTITY);
}

/**
 * Trim, collapse internal whitespace, cap the length. Returns null for a name that is empty or
 * nothing but whitespace, so callers have one unambiguous "they didn't name it" signal rather
 * than having to test for an empty string themselves.
 */
export function normaliseListName(raw: string): string | null {
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0) return null;
  return collapsed.slice(0, MAX_LIST_NAME_LENGTH);
}

/**
 * The name a list gets when the shopper didn't type one.
 *
 * A pure function of its argument — it takes the clock rather than reading it — so a test can
 * assert the exact string, and so two calls within one request cannot disagree.
 */
export function defaultListName(now: Date): string {
  const date = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `List — ${date}`.slice(0, MAX_LIST_NAME_LENGTH);
}

/**
 * Parsed lines → rows to persist.
 *
 * Lines with no usable terms are dropped rather than stored: a row whose `terms` is empty could
 * never match anything on re-open, so it would render as a permanently unmatched line the shopper
 * cannot act on. `position` is the index in the RETURNED array, so it stays dense after drops.
 */
export function linesToItems(lines: readonly ParsedLine[]): SavedListItemInput[] {
  const items: SavedListItemInput[] = [];

  for (const line of lines) {
    if (items.length >= MAX_LIST_LINES) break;
    if (line.terms.length === 0) continue;

    items.push({
      rawText: line.original,
      terms: line.terms.join(" "),
      quantity: clampQuantity(line.quantity),
      measure: line.measure ?? null,
      brand: line.brand ?? null,
      position: items.length,
    });
  }

  return items;
}

/**
 * Rows → parsed lines, ready to hand straight to `resolveLines()`.
 *
 * Sorted here rather than relying on the caller's `orderBy`: this function's contract is
 * position order, and a list that renders in insertion order on one surface and storage order on
 * another would be a bug nobody could see in a unit test.
 */
export function itemsToLines(rows: readonly SavedListItemRow[]): ParsedLine[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      original: row.rawText,
      quantity: clampQuantity(row.quantity),
      terms: row.terms.split(/\s+/).filter((term) => term.length > 0),
      measure: row.measure,
      brand: row.brand,
    }))
    .filter((line) => line.terms.length > 0);
}

/**
 * Catalogue product names → parsed lines, for the /cart and past-order entry points.
 *
 * No AI normalisation is involved and none is wanted: the text is already a catalogue name, so
 * `toTerms` of it re-matches the very product it came from. `measure` and `brand` stay null
 * because nothing here is the shopper's own phrasing — they are only ever set by the pre-pass in
 * `lib/list-normalisation.ts`, which reads what a person typed.
 */
export function productNamesToLines(
  entries: readonly { name: string; quantity: number }[],
): ParsedLine[] {
  const lines: ParsedLine[] = [];

  for (const entry of entries) {
    const terms = toTerms(entry.name);
    if (terms.length === 0) continue;

    lines.push({
      original: entry.name,
      quantity: clampQuantity(entry.quantity),
      terms,
      measure: null,
      brand: null,
    });
  }

  return lines;
}
