import { departmentIllustration, department3DIcon } from "@/components/icons/illustrations";
import { Icon } from "@/components/icons/Icon";
import { Icon3D } from "@/components/icons/Icon3D";
import { categoryIconName } from "@/components/product/category-icon";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";

/**
 * The corner glyph of a `DepartmentHero` panel (#1223 Phase 4a, R46, updated #1278):
 * displays genuine product photography for the department when an `imageUrl` is supplied,
 * falling back to the department illustration or neutral decorative glyph from `categoryIconName`.
 */
export function DepartmentGlyph({
  slug,
  loading,
  use3D = false,
  imageUrl,
}: {
  slug: string;
  /** The first panel is above the fold and loads eagerly; the rest wait. */
  loading?: "eager" | "lazy";
  use3D?: boolean;
  /** Optional explicit image URL from CategorySummary / DepartmentHero. */
  imageUrl?: string | null;
}) {
  const icon3D = use3D ? department3DIcon(slug) : null;
  if (icon3D) {
    return <Icon3D name={icon3D} size={96} className="h-24 w-24 md:h-32 md:w-32" />;
  }

  const fallback = (
    <Icon
      name={categoryIconName(slug)}
      className="h-24 w-24 text-white/85 md:h-32 md:w-32"
      strokeWidth={1.25}
    />
  );

  if (imageUrl) {
    return (
      <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/95 p-2 shadow-md md:h-32 md:w-32">
        <ImageWithFallback
          src={imageUrl}
          alt=""
          width={128}
          height={128}
          loading={loading}
          decoding="async"
          className="h-full w-full object-contain"
          fallback={fallback}
        />
      </div>
    );
  }

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
