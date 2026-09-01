import Link from "next/link";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * #494 — `getCategoryBySlug` has always fetched a category's `children`
 * ("the only shape the storefront can render", per its own comment in
 * `lib/repositories/categories.ts`), but nothing ever rendered them, so a
 * subcategory — and anything assigned to it, whether seeded or created live
 * via the staff panel's `CategoryForm` — was unreachable except by typing its
 * URL or using search.
 *
 * #496 — the leading "All" pill is the department itself, which aggregates
 * its own products with every child's — see `listProductsByCategory`'s array
 * parameter.
 *
 * #498 — a subcategory's own page used to render NO tabs at all (its own
 * `children` is always empty, the tree being capped at two levels), so
 * clicking into one lost all navigation back to its siblings. `tabs` is now
 * always the FULL sibling set — a department's own children, or (when
 * viewing a subcategory) its parent's children, itself included — computed
 * by the caller from `CategoryWithChildren.parent`. `activeSlug` is
 * whichever of `parentSlug`/a tab's slug is currently being viewed, so
 * exactly one pill is ever highlighted regardless of which page this is.
 */
export function SubcategoryLinks({
  tabs,
  parentSlug,
  activeSlug,
}: {
  tabs: CategorySummary[];
  parentSlug: string;
  activeSlug: string;
}) {
  if (tabs.length === 0) return null;

  const pill = (isActive: boolean) =>
    isActive
      ? "rounded-full border border-action bg-action px-4 py-2 text-sm font-medium text-white"
      : "rounded-full border border-black/10 bg-action-tint px-4 py-2 text-sm font-medium text-primary hover:bg-action/10";

  return (
    <nav aria-label="Subcategories" className="mb-6 flex flex-wrap gap-2">
      <Link
        href={`/categories/${parentSlug}`}
        aria-current={activeSlug === parentSlug ? "page" : undefined}
        className={pill(activeSlug === parentSlug)}
      >
        All
      </Link>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={`/categories/${tab.slug}`}
          aria-current={activeSlug === tab.slug ? "page" : undefined}
          className={pill(activeSlug === tab.slug)}
        >
          {tab.name}
        </Link>
      ))}
    </nav>
  );
}
