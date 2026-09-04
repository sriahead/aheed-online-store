import Link from "next/link";
import type { CategorySummary } from "@/lib/repositories/categories";
import { categoryFilterHref, type SearchHrefParams } from "./search-href";

/**
 * Narrow search results to a department, without leaving the results page (#568).
 *
 * The distinction from `SubcategoryLinks` (which navigates to `/categories/[slug]`) is the whole
 * point: this sets a `category` PARAMETER on `/search`, so the shopper's query survives. Drilling
 * down by navigating away would drop `q`, which is the thing they were narrowing.
 *
 * Two levels, matching the category tree's own cap: departments always, plus the selected
 * department's children once one is chosen. A selected subcategory keeps its siblings visible (the
 * page passes its PARENT's children, matching `/categories/[slug]`'s own tab behaviour), so
 * drill-down is reversible without using the back button.
 */
export function CategoryDrillDown({
  categories,
  subcategories,
  params,
  activeSlug,
}: {
  /** Top-level departments. */
  categories: readonly CategorySummary[];
  /** Children of the selected department, or of the selected subcategory's parent. */
  subcategories?: readonly CategorySummary[];
  params: SearchHrefParams;
  activeSlug: string | null;
}) {
  if (categories.length === 0) return null;

  return (
    <nav aria-label="Filter by department" className="mb-4">
      <ul className="flex flex-wrap gap-2">
        {categories.map((category) => {
          const active = category.slug === activeSlug;
          return (
            <li key={category.id}>
              <Link
                href={categoryFilterHref(params, category.slug)}
                aria-current={active ? "true" : undefined}
                className={
                  active
                    ? "inline-block rounded-full bg-action px-3 py-1 text-sm font-semibold text-white"
                    : "inline-block rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-primary hover:bg-surface-muted"
                }
              >
                {category.name}
              </Link>
            </li>
          );
        })}
      </ul>

      {subcategories && subcategories.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2 border-t border-black/5 pt-2">
          {subcategories.map((child) => {
            const active = child.slug === activeSlug;
            return (
              <li key={child.id}>
                <Link
                  href={categoryFilterHref(params, child.slug)}
                  aria-current={active ? "true" : undefined}
                  className={
                    active
                      ? "inline-block rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white"
                      : "inline-block rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-primary hover:bg-surface-muted"
                  }
                >
                  {child.name}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
