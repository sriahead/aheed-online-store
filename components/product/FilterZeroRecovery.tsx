import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { clearAllHref, type FilterChipParams } from "./filter-chips";
import { filterEntries } from "./filter-params";

export function FilterZeroRecovery({
  basePath,
  params,
  brandLabel,
}: {
  basePath: string;
  params: FilterChipParams;
  brandLabel?: string;
}) {
  const hasPrice = typeof params.minPrice === "string" || typeof params.maxPrice === "string";
  const hasBrand = typeof params.brand === "string" && params.brand !== "";

  // Helper to build href omitting specific keys
  const hrefWithout = (omitKeys: string[]) => {
    const qs = new URLSearchParams();
    if (typeof params.q === "string" && params.q !== "") {
      qs.set("q", params.q);
    }
    if (typeof params.sort === "string" && params.sort !== "") {
      qs.set("sort", params.sort);
    }
    for (const [key, value] of filterEntries(params, [...omitKeys, "cursor", "back"])) {
      qs.append(key, value);
    }
    const query = qs.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <div
      data-tap-surface="filter-zero-recovery"
      className="my-8 rounded-2xl border border-black/10 bg-surface-muted/40 p-6 sm:p-8 text-center max-w-xl mx-auto shadow-xs"
    >
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-action-tint text-action mb-4">
        <Icon name="sliders-horizontal" className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-primary mb-2">No matching products found</h3>
      <p className="text-sm text-primary-muted mb-6">
        None of the products match all of your selected filters together. Try relaxing or removing a
        filter below.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {hasPrice && (
          <Link
            href={hrefWithout(["minPrice", "maxPrice"])}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-primary hover:border-black/30 hover:bg-surface-muted transition-colors"
          >
            <span>Remove price filter</span>
            <Icon name="x" className="h-3.5 w-3.5 text-primary-muted" />
          </Link>
        )}
        {hasBrand && (
          <Link
            href={hrefWithout(["brand"])}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-primary hover:border-black/30 hover:bg-surface-muted transition-colors"
          >
            <span>Remove brand: {brandLabel ?? params.brand}</span>
            <Icon name="x" className="h-3.5 w-3.5 text-primary-muted" />
          </Link>
        )}
        <Link
          href={clearAllHref(basePath, params)}
          className="inline-flex items-center rounded-full bg-action px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-action-hover transition-colors shadow-xs"
        >
          Clear all filters
        </Link>
      </div>
    </div>
  );
}
