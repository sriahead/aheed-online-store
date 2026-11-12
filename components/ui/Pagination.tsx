import Link from "next/link";
import { pageWindow, rowRange } from "@/lib/pagination";
import { Icon } from "@/components/icons/Icon";

/**
 * The app's one pagination bar (owner request, 2026-11-12). Its design is the /staff/products bar
 * (#1523): "Page X of Y · Showing a–b of N" on the left, then Previous, page numbers, Next and a
 * jump-to-page box. Plain links and a GET form, so no client JavaScript is needed and the URL stays
 * shareable. It is a server component; `hrefFor` is a function prop, so render it only from server
 * components.
 *
 * Two modes (`lib/pagination.ts` says why):
 * - `numbered`, for bounded lists that know their total;
 * - `sequential`, for keyset lists that only know whether there is a previous and a next page. It
 *   has the same buttons and styling, plus "Page N" when the caller knows it, and no total.
 *
 * Every href comes from the caller, which must carry the list's active filters. A next page that
 * quietly widened back to the whole list would read as lost data (#503).
 *
 * The copy is neutral: the caller names what is being counted (`noun`), because vendors sell
 * different things.
 */

const LINK =
  "inline-flex min-h-tap min-w-9 items-center justify-center rounded-xl border border-black/10 bg-white px-2.5 py-1.5 text-sm font-semibold text-primary hover:bg-surface-muted lg:min-h-0";
const CURRENT =
  "inline-flex min-h-tap min-w-9 items-center justify-center rounded-xl bg-primary px-2.5 py-1.5 text-sm font-bold text-white lg:min-h-0";

interface Common {
  /** Names the bar for screen readers, e.g. "Product pages". */
  label: string;
  /** A list with a bar above and below it passes both, so each has its own name and form ids. */
  position?: "top" | "bottom";
}

export interface NumberedPagination extends Common {
  mode: "numbered";
  page: number;
  pageCount: number;
  total: number;
  perPage: number;
  /** Rows on this page. */
  shown: number;
  /** Singular and plural, e.g. ["product", "products"]. */
  noun: readonly [string, string];
  hrefFor: (page: number) => string;
  /**
   * Adds a jump-to-page box when there are more than 7 pages. `hidden` are the active filters, sent
   * with the page number as `?page=`.
   */
  jump?: { action: string; hidden: readonly (readonly [string, string])[] };
}

export interface SequentialPagination extends Common {
  mode: "sequential";
  /** Shown as "Page N" when known (a cursor stack knows it; a next-only list does not). */
  page?: number;
  prevHref?: string | null;
  nextHref?: string | null;
  /** For a next-only list: a way back to the start once past it. */
  firstHref?: string | null;
}

export type PaginationProps = NumberedPagination | SequentialPagination;

function Previous({ href }: { href: string }) {
  return (
    <Link href={href} className={LINK} rel="prev">
      <Icon name="chevron-left" className="h-4 w-4" />
      <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
    </Link>
  );
}

function Next({ href }: { href: string }) {
  return (
    <Link href={href} className={LINK} rel="next">
      <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
      <Icon name="chevron-right" className="h-4 w-4" />
    </Link>
  );
}

export function Pagination(props: PaginationProps) {
  const position = props.position ?? "bottom";
  const navProps = {
    "aria-label": props.position ? `${props.label} (${props.position})` : props.label,
    "data-pagination": position,
    className: `flex flex-wrap items-center justify-between gap-3 ${position === "top" ? "mb-4" : "mt-6"}`,
  };

  if (props.mode === "sequential") {
    const { page, prevHref, nextHref, firstHref } = props;
    if (!prevHref && !nextHref && !firstHref) return null;
    return (
      <nav {...navProps} data-tap-surface="pagination">
        <p className="text-sm text-primary-muted" aria-live="polite">
          {page ? <span className="font-bold text-primary">Page {page}</span> : null}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {firstHref && !prevHref ? (
            <Link href={firstHref} className={LINK}>
              First page
            </Link>
          ) : null}
          {prevHref ? <Previous href={prevHref} /> : null}
          {page ? (
            <span aria-current="page" className={CURRENT}>
              {page}
            </span>
          ) : null}
          {nextHref ? <Next href={nextHref} /> : null}
        </div>
      </nav>
    );
  }

  const { page, pageCount, total, perPage, shown, noun, hrefFor, jump } = props;
  const { first, last } = rowRange(page, perPage, shown, total);
  const fmt = (n: number) => n.toLocaleString("en-GB");

  return (
    <nav {...navProps} data-tap-surface="pagination">
      <p className="text-sm text-primary-muted" aria-live="polite">
        <span className="font-bold text-primary">
          Page {page} of {pageCount}
        </span>
        <span className="mx-2">·</span>
        Showing {fmt(first)}–{fmt(last)} of {fmt(total)} {total === 1 ? noun[0] : noun[1]}
      </p>

      {pageCount > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {page > 1 ? <Previous href={hrefFor(page - 1)} /> : null}
          {pageWindow(page, pageCount).map((entry, index) =>
            entry === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-primary-muted" aria-hidden="true">
                …
              </span>
            ) : entry === page ? (
              <span key={entry} aria-current="page" className={CURRENT}>
                {entry}
              </span>
            ) : (
              <Link key={entry} href={hrefFor(entry)} className={LINK}>
                {entry}
              </Link>
            ),
          )}
          {page < pageCount ? <Next href={hrefFor(page + 1)} /> : null}

          {jump && pageCount > 7 && (
            <form method="get" action={jump.action} className="ml-1 flex items-center gap-1.5">
              {jump.hidden.map(([name, value]) => (
                <input key={`${name}=${value}`} type="hidden" name={name} value={value} />
              ))}
              <label className="sr-only" htmlFor={`jump-${position}`}>
                Go to page
              </label>
              <input
                id={`jump-${position}`}
                type="number"
                name="page"
                min={1}
                max={pageCount}
                placeholder="Page"
                className="min-h-tap w-20 rounded-xl border border-black/10 bg-white px-2 py-1.5 text-sm text-primary lg:min-h-0"
              />
              <button type="submit" className={LINK}>
                Go
              </button>
            </form>
          )}
        </div>
      )}
    </nav>
  );
}
