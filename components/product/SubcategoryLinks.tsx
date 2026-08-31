import Link from "next/link";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * #494 — `getCategoryBySlug` has always fetched a category's `children`
 * ("the only shape the storefront can render", per its own comment in
 * `lib/repositories/categories.ts`), but nothing ever rendered them, so a
 * subcategory — and anything assigned to it, whether seeded or created live
 * via the staff panel's `CategoryForm` — was unreachable except by typing its
 * URL or using search. Renders nothing when there are no children, rather
 * than an empty section, since a subcategory itself has none (the tree is
 * capped at two levels).
 *
 * #496 — the leading "All" pill is the page currently being viewed (this
 * component only ever renders on a parent category's own page, since a
 * subcategory has no children of its own), which now aggregates the parent's
 * own products with every child's — see `listProductsByCategory`'s array
 * parameter. Each subcategory pill still links to that subcategory's own
 * dedicated page, which shows only its own products, unchanged.
 */
export function SubcategoryLinks({
  subcategories,
  currentSlug,
}: {
  subcategories: CategorySummary[];
  currentSlug: string;
}) {
  if (subcategories.length === 0) return null;

  return (
    <nav aria-label="Subcategories" className="mb-6 flex flex-wrap gap-2">
      <Link
        href={`/categories/${currentSlug}`}
        aria-current="page"
        className="rounded-full border border-action bg-action px-4 py-2 text-sm font-medium text-white"
      >
        All
      </Link>
      {subcategories.map((child) => (
        <Link
          key={child.id}
          href={`/categories/${child.slug}`}
          className="rounded-full border border-black/10 bg-action-tint px-4 py-2 text-sm font-medium text-primary hover:bg-action/10"
        >
          {child.name}
        </Link>
      ))}
    </nav>
  );
}
