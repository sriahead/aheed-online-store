"use client";

import { Icon } from "@/components/icons/Icon";
import { filterEntries, type FilterParams } from "./filter-params";
import {
  SORT_OPTIONS,
  SORT_OPTION_LABELS,
  parseSortOption,
  type ProductSortOption,
} from "./sort-params";

export function ProductSortSelect({
  basePath,
  currentSort,
  params,
  defaultSort = "newest",
}: {
  basePath: string;
  currentSort?: string;
  params: FilterParams & { q?: string };
  defaultSort?: ProductSortOption;
}) {
  const activeSort = parseSortOption(currentSort, defaultSort);
  // Omit sort and pagination from hidden inputs so changing sort restarts on page 1
  const entries = filterEntries(params, ["sort", "cursor", "back"]);

  return (
    <form
      action={basePath}
      method="GET"
      data-tap-surface="sort-select"
      className="flex items-center gap-2"
    >
      {/* Retain search query if present */}
      {typeof params.q === "string" && params.q !== "" && (
        <input type="hidden" name="q" value={params.q} />
      )}
      {/* Retain every active filter */}
      {entries.map(([key, value], idx) => (
        <input key={`${key}-${idx}`} type="hidden" name={key} value={value} />
      ))}
      <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-primary-muted shrink-0">
        <span>Sort by</span>
        <div className="relative inline-flex items-center">
          <select
            name="sort"
            defaultValue={activeSort}
            onChange={(e) => e.target.form?.submit()}
            className="appearance-none rounded-lg border border-black/15 bg-white py-1.5 pl-3 pr-8 text-xs sm:text-sm font-medium text-primary hover:border-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action cursor-pointer shadow-sm"
            aria-label="Sort products by"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {SORT_OPTION_LABELS[option]}
              </option>
            ))}
          </select>
          <Icon
            name="chevron-down"
            className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-primary-muted"
          />
        </div>
      </label>
      <noscript>
        <button
          type="submit"
          className="rounded-lg bg-surface-muted border border-black/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-black/5"
        >
          Sort
        </button>
      </noscript>
    </form>
  );
}
