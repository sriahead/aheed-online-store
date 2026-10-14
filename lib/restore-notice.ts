/**
 * The "not everything went back in" notice (#957) — pure, shared by the two actions that write it
 * (`features/orders/reorder-items.ts`, `features/checkout/cancel-order.ts`) and the cart page that
 * renders it.
 *
 * THIS LIVES IN A PLAIN MODULE because both actions are `"use server"` files, which may export ONLY
 * async functions (CLAUDE.md's Server Actions section).
 *
 * Like the bundle notice (`lib/bundle-notice.ts`), the state travels in the query string: it
 * survives the redirect with no cookie, table or expiry, and a headless check can build one by hand.
 * Anyone can therefore link to `/cart?restored=…` with names of their own. React escapes the text,
 * so it is content, never markup, and the parser below caps how much of it a link can show.
 *
 *   /cart?restored={reorder|cancelled|list}&of={n}&lines={k}~{added}~{requested}~{name}|…
 *
 * `n` is how many distinct lines the action tried to put back. `lines` lists only those that did
 * not go in in full: `u` unavailable, `p` partial, `h` the cart already holds all the stock, and
 * (`#1088`, the `list` source only) `s` the shopper left an ambiguous line unresolved, so no
 * product was ever chosen for it.
 */

import type { BulkAddKind } from "@/lib/cart-rules";

export type RestoreSource = "reorder" | "cancelled" | "list";
export type RestoreEntryKind = "u" | "p" | "h" | "s";

export interface RestoreEntry {
  kind: RestoreEntryKind;
  added: number;
  requested: number;
  name: string;
}

export interface RestoreNotice {
  source: RestoreSource;
  /** Lines the action tried to restore, always at least `entries.length`. */
  of: number;
  entries: RestoreEntry[];
}

/**
 * What an action can report about one line.
 *
 * `#1088` adds `"skipped"` HERE rather than to `lib/cart-rules.ts`'s `BulkAddKind`: a shop-list
 * line the shopper declined to resolve never reached the cart layer at all, so it is not one of
 * that layer's outcomes. Everything else is the bulk add's own kind, unchanged.
 */
export type RestoredLineKind = BulkAddKind | "skipped";

/** One restored line, as an action knows it: the bulk add's kind, or `unavailable` for a deleted product. */
export interface RestoredLine {
  name: string;
  requested: number;
  added: number;
  kind: RestoredLineKind;
}

export const MAX_RESTORE_ENTRIES = 50;
export const MAX_RESTORE_NAME_LENGTH = 120;

const ENTRY_SEPARATOR = "|";
const FIELD_SEPARATOR = "~";

const KIND_CODE: Record<Exclude<RestoredLineKind, "added">, RestoreEntryKind> = {
  unavailable: "u",
  partial: "p",
  at_limit: "h",
  skipped: "s",
};

/** The cart URL to land on after a restore. Exactly `/cart` when every line went in in full. */
export function buildRestoreNoticeUrl(source: RestoreSource, lines: RestoredLine[]): string {
  const short = lines.filter((line) => line.kind !== "added");
  if (short.length === 0) return "/cart";

  const entries = short
    .map((line) =>
      [
        KIND_CODE[line.kind as Exclude<RestoredLineKind, "added">],
        line.added,
        line.requested,
        line.name.split(ENTRY_SEPARATOR).join("/"),
      ].join(FIELD_SEPARATOR),
    )
    .join(ENTRY_SEPARATOR);

  const params = new URLSearchParams({
    restored: source,
    of: String(lines.length),
    lines: entries,
  });
  return `/cart?${params.toString()}`;
}

const isCount = (raw: string) => /^\d+$/.test(raw);

function parseEntry(raw: string): RestoreEntry | null {
  // Split on the first three `~` only: everything after them is the name, which may contain `~`.
  const parts = raw.split(FIELD_SEPARATOR);
  if (parts.length < 4) return null;
  const [kind, addedRaw, requestedRaw] = parts;
  const name = parts.slice(3).join(FIELD_SEPARATOR).trim();

  if (kind !== "u" && kind !== "p" && kind !== "h" && kind !== "s") return null;
  if (!isCount(addedRaw) || !isCount(requestedRaw)) return null;
  if (name === "") return null;

  const added = Number(addedRaw);
  const requested = Number(requestedRaw);
  if (kind === "p" && !(added > 0 && added < requested)) return null;
  // A skipped line was never sent to the cart, so a non-zero `added` is a
  // contradiction — the same shape of invariant the `p` check above enforces.
  if (kind === "s" && !(added === 0 && requested >= 1)) return null;

  return { kind, added, requested, name: name.slice(0, MAX_RESTORE_NAME_LENGTH) };
}

/** The cart page's side. `null` means render nothing. Malformed input is dropped, never thrown. */
export function parseRestoreNotice(params: {
  restored?: string;
  of?: string;
  lines?: string;
}): RestoreNotice | null {
  const source = params.restored;
  if (source !== "reorder" && source !== "cancelled" && source !== "list") return null;

  const entries = (params.lines ?? "")
    .split(ENTRY_SEPARATOR)
    .map(parseEntry)
    .filter((entry): entry is RestoreEntry => entry !== null)
    .slice(0, MAX_RESTORE_ENTRIES);
  if (entries.length === 0) return null;

  const ofRaw = params.of ?? "";
  const of = isCount(ofRaw) && Number(ofRaw) >= entries.length ? Number(ofRaw) : entries.length;

  return { source, of, entries };
}
