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
 */
export function SubcategoryLinks({ subcategories }: { subcategories: CategorySummary[] }) {
  if (subcategories.length === 0) return null;

  return (
    <nav aria-label="Subcategories" className="mb-6 flex flex-wrap gap-2">
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
