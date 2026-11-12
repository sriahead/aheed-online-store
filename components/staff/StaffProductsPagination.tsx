import Link from "next/link";
import {
  DEFAULT_PER_PAGE,
  DEFAULT_SORT,
  pageWindow,
  staffProductsHref,
  type StaffProductsQuery,
} from "@/lib/staff-products-query";
import { Icon } from "@/components/icons/Icon";

/**
 * #1523 — the /staff/products pagination bar, rendered ABOVE and BELOW the list.
 *
 * It answers "where am I, and how much is there" before anything else ("Page 3 of 63", "Showing
 * 51–75 of 6,238"), so nobody has to scroll to the bottom to find out the list goes on. Every link
 * is built by staffProductsHref, so a page link carries every active filter. A next page that
 * quietly widened back to the whole catalogue would be worse than no paging (#503). Plain links
 * and a GET form: no client JavaScript, and the URL stays shareable.
 */
export function StaffProductsPagination({
  query,
  page,
  pageCount,
  total,
  shown,
  position,
}: {
  query: StaffProductsQuery;
  page: number;
  pageCount: number;
  total: number;
  /** Rows on this page. */
  shown: number;
  position: "top" | "bottom";
}) {
  const first = total === 0 ? 0 : (page - 1) * query.perPage + 1;
  const last = total === 0 ? 0 : first + shown - 1;
  const linkClass =
    "inline-flex min-w-9 items-center justify-center rounded-xl border border-black/10 px-2.5 py-1.5 text-sm font-semibold text-primary hover:bg-surface-muted";

  return (
    <nav
      aria-label={`Product pages (${position})`}
      data-pagination={position}
      className={`flex flex-wrap items-center justify-between gap-3 ${position === "top" ? "mb-4" : "mt-6"}`}
    >
      <p className="text-sm text-primary-muted" aria-live="polite">
        <span className="font-bold text-primary">
          Page {page} of {pageCount}
        </span>
        <span className="mx-2">·</span>
        Showing {first.toLocaleString("en-GB")}–{last.toLocaleString("en-GB")} of{" "}
        {total.toLocaleString("en-GB")} {total === 1 ? "product" : "products"}
      </p>

      {pageCount > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {page > 1 ? (
            <Link href={staffProductsHref(query, page - 1)} className={linkClass} rel="prev">
              <Icon name="chevron-left" className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
            </Link>
          ) : null}
          {pageWindow(page, pageCount).map((entry, index) =>
            entry === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-primary-muted" aria-hidden="true">
                …
              </span>
            ) : entry === page ? (
              <span
                key={entry}
                aria-current="page"
                className="inline-flex min-w-9 items-center justify-center rounded-xl bg-primary px-2.5 py-1.5 text-sm font-bold text-white"
              >
                {entry}
              </span>
            ) : (
              <Link key={entry} href={staffProductsHref(query, entry)} className={linkClass}>
                {entry}
              </Link>
            ),
          )}
          {page < pageCount ? (
            <Link href={staffProductsHref(query, page + 1)} className={linkClass} rel="next">
              <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
              <Icon name="chevron-right" className="h-4 w-4" />
            </Link>
          ) : null}

          {/* Jump straight to a page: a GET form carrying the current filters as hidden fields. */}
          {pageCount > 7 && (
            <form method="get" action="/staff/products" className="ml-1 flex items-center gap-1.5">
              {query.status !== "all" && <input type="hidden" name="status" value={query.status} />}
              {query.search && <input type="hidden" name="q" value={query.search} />}
              {query.category !== "all" && (
                <input type="hidden" name="category" value={query.category} />
              )}
              {query.restriction && (
                <input type="hidden" name="restriction" value={query.restriction} />
              )}
              {query.stockMode && <input type="hidden" name="stock" value={query.stockMode} />}
              {query.perPage !== DEFAULT_PER_PAGE && (
                <input type="hidden" name="perPage" value={query.perPage} />
              )}
              {query.sort !== DEFAULT_SORT && (
                <input type="hidden" name="sort" value={query.sort} />
              )}
              {query.needs && <input type="hidden" name="needs" value={query.needs} />}
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
                className="w-20 rounded-xl border border-black/10 bg-white px-2 py-1.5 text-sm text-primary"
              />
              <button
                type="submit"
                className="rounded-xl border border-black/10 px-2.5 py-1.5 text-sm font-semibold text-primary hover:bg-surface-muted"
              >
                Go
              </button>
            </form>
          )}
        </div>
      )}
    </nav>
  );
}
