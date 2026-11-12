/**
 * The app's one pagination model (pure, DB-free). `components/ui/Pagination.tsx` renders it.
 *
 * Two modes, because `specs/architecture.md` ("Pagination") allows numbered pages only where a list
 * is bounded: the staff product list, the customer list and ranked search. Every other list pages by
 * keyset cursor and can only say "previous" and "next", so it gets the same design without page
 * numbers or a total.
 */

/**
 * The page links to show: first, last, and two either side of the current page, with "gap" where
 * pages are skipped. A single skipped page is shown rather than replaced by a gap, since a gap that
 * hides one number saves nothing.
 */
export function pageWindow(current: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const wanted = new Set<number>([1, pages]);
  for (let p = current - 2; p <= current + 2; p++) if (p >= 1 && p <= pages) wanted.add(p);
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (typeof last === "number" && p - last === 2) out.push(last + 1);
    else if (typeof last === "number" && p - last > 2) out.push("gap");
    out.push(p);
  }
  return out;
}

/** Pages needed for `total` rows, never fewer than 1 (an empty list is still "Page 1 of 1"). */
export function pageCountFor(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** The 1-based row range a page shows: "Showing 26–50". `{0, 0}` for an empty list. */
export function rowRange(
  page: number,
  perPage: number,
  shown: number,
  total: number,
): { first: number; last: number } {
  if (total === 0 || shown === 0) return { first: 0, last: 0 };
  const first = (page - 1) * perPage + 1;
  return { first, last: first + shown - 1 };
}

/**
 * A `?page=` value as a 1-based page clamped to `pageCount`. Anything not a run of digits, and a
 * repeated parameter (an array at runtime, #689), reads as page 1, so a forged or stale link lands
 * on a real page and never on an empty list.
 */
export function parsePageParam(raw: unknown, pageCount: number): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return 1;
  return Math.min(Math.max(1, Number(value)), Math.max(1, pageCount));
}
