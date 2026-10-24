import { departmentIllustration } from "@/components/icons/illustrations";
import { Icon } from "@/components/icons/Icon";
import { categoryIconName } from "@/components/product/category-icon";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";

/**
 * The corner glyph of a `DepartmentHero` panel (#1223 Phase 4a, R46): the department's illustration when
 * it has one, the neutral decorative glyph when it does not. One component, used by both places the hero
 * shows it (a panel with no stored image, and a stored image that failed to load), so the two cannot
 * drift apart.
 *
 * The illustration is a static platform file rendered through `ImageWithFallback` (the one place a
 * storefront `<img>` is written, #655), so a missing file degrades to the glyph and not to a broken-image
 * icon. An unmapped slug never gets a picture: it takes the neutral glyph from `categoryIconName`, which
 * is `tag` for every slug without an illustration (#729).
 */
export function DepartmentGlyph({
  slug,
  loading,
}: {
  slug: string;
  /** The first panel is above the fold and loads eagerly; the rest wait. */
  loading?: "eager" | "lazy";
}) {
  const fallback = (
    <Icon
      name={categoryIconName(slug)}
      className="h-24 w-24 text-white/85 md:h-32 md:w-32"
      strokeWidth={1.25}
    />
  );
  const src = departmentIllustration(slug);
  if (!src) return fallback;
  return (
    <ImageWithFallback
      src={src}
      alt=""
      width={128}
      height={128}
      loading={loading}
      decoding="async"
      className="h-24 w-24 md:h-32 md:w-32"
      fallback={fallback}
    />
  );
}
