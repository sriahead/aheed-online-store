import Link from "next/link";
import { IconMedallion } from "@/components/icons/IconMedallion";
import { categoryIconName } from "@/components/product/category-icon";
import { departmentIllustration } from "@/components/icons/illustrations";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * Tile size matching the main category scroller tiles (#1288).
 */
const TILE_SIZE = 64;

/**
 * #494 — `getCategoryBySlug` has always fetched a category's `children`
 * ("the only shape the storefront can render", per its own comment in
 * `lib/repositories/categories.ts`), but nothing ever rendered them, so a
 * subcategory — and anything assigned to it, whether seeded or created live
 * via the staff panel's `CategoryForm` — was unreachable except by typing its
 * URL or using search.
 *
 * #496 — the leading "All" tile is the department itself, which aggregates
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
 * exactly one tile is ever highlighted regardless of which page this is.
 *
 * Subcategories follow the exact same visual design, circular medallion styling,
 * and layout as main category tiles (circular icon/illustration medallion with title underneath).
 */
export function SubcategoryLinks({
  tabs,
  parentSlug,
  activeSlug,
  hrefFor,
  carriedQuery = "",
  searchMode = false,
}: {
  tabs: CategorySummary[];
  parentSlug: string;
  activeSlug: string;
  hrefFor?: (slug: string) => string;
  carriedQuery?: string;
  searchMode?: boolean;
}) {
  if (tabs.length === 0) return null;

  const resolveHref = (slug: string) => {
    if (hrefFor) return hrefFor(slug);
    if (searchMode) {
      return `/search?category=${slug}${carriedQuery ? `&${carriedQuery}` : ""}`;
    }
    return `/categories/${slug}${carriedQuery ? `?${carriedQuery}` : ""}`;
  };

  const isAllActive = activeSlug === parentSlug;

  const medallionClass =
    "transition duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-action/30 group-hover:shadow-md";

  return (
    <nav
      aria-label="Subcategories"
      data-tap-surface="subcategories"
      className="mb-6 flex items-start gap-4 overflow-x-auto pb-2 -mx-2 px-2 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible"
    >
      <Link
        href={resolveHref(parentSlug)}
        aria-current={isAllActive ? "page" : undefined}
        className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center min-h-tap lg:min-h-0"
      >
        <IconMedallion
          icon="layers"
          fallbackImageUrl="/images/categories/all.jpg"
          size={TILE_SIZE}
          tint="action"
          active={isAllActive}
          className={medallionClass}
          decorative
        />
        <span
          className={`line-clamp-2 text-xs leading-tight ${
            isAllActive ? "font-semibold text-action" : "font-medium text-primary"
          }`}
        >
          All
        </span>
      </Link>
      {tabs.map((tab) => {
        const isActive = activeSlug === tab.slug;
        const glyphName = categoryIconName(tab.slug);
        const illustration = departmentIllustration(tab.slug);
        const photoUrl = tab.imageUrl;

        return (
          <Link
            key={tab.id}
            href={resolveHref(tab.slug)}
            aria-current={isActive ? "page" : undefined}
            className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center min-h-tap lg:min-h-0"
          >
            {photoUrl ? (
              <IconMedallion
                imageUrl={photoUrl}
                fallbackIcon={glyphName}
                size={TILE_SIZE}
                tint="action"
                active={isActive}
                className={medallionClass}
                decorative
              />
            ) : illustration ? (
              <IconMedallion
                imageUrl={illustration}
                imageFit="inset"
                fallbackIcon={glyphName}
                size={TILE_SIZE}
                tint="action"
                active={isActive}
                className={medallionClass}
                decorative
              />
            ) : (
              <IconMedallion
                icon={glyphName}
                size={TILE_SIZE}
                tint="action"
                active={isActive}
                className={medallionClass}
                decorative
              />
            )}
            <span
              className={`line-clamp-2 text-xs leading-tight ${
                isActive ? "font-semibold text-action" : "font-medium text-primary"
              }`}
            >
              {tab.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
