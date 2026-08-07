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
      <ul className="flex flex-col gap-1">
        {categories.map((category) => {
          const Icon = categoryIcon(category.slug);
          const isActive = category.slug === activeSlug;
          return (
            <li key={category.id}>
              <Link
                href={`/categories/${category.slug}`}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-action-tint font-semibold text-primary"
                    : "text-primary/80 hover:bg-surface-muted"
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
