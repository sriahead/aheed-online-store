import Link from "next/link";
import { categoryIcon } from "@/components/product/category-icon";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * Presentational category sidebar — receives its data as props (the pages fetch
 * via getCategoryRepository and pass down, mirroring how ProductCard receives
 * its product). Renders one entry per passed category, whatever N that is —
 * no hardcoded department count.
 */
export function CategorySidebar({
  categories,
  activeSlug,
}: {
  categories: CategorySummary[];
  activeSlug: string | null;
}) {
  return (
    <nav aria-label="Departments" className="shrink-0 md:w-56">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary/60">
        Departments
      </h2>
      {/* Horizontal scroll on mobile (a tall vertical list would bury the products);
          a normal vertical sidebar from md up. */}
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-1 md:overflow-visible md:px-0 md:pb-0">
        {categories.map((category) => {
          const Icon = categoryIcon(category.slug);
          const isActive = category.slug === activeSlug;
          return (
            <li key={category.id} className="shrink-0">
              <Link
                href={`/categories/${category.slug}`}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium md:rounded-md ${
                  isActive
                    ? "bg-action-tint font-semibold text-primary"
                    : "border border-black/10 text-primary/80 hover:bg-surface-muted md:border-0"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {category.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
