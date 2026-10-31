import { departmentIllustration, department3DIcon } from "@/components/icons/illustrations";
import { IconMedallion } from "@/components/icons/IconMedallion";
import { categoryIconName } from "@/components/product/category-icon";

/** 96 px on phones; the `md:` classes (with `!`, to beat the medallion's inline size) make it 128 px. */
const GLYPH_SIZE = 96;
const GLYPH_CLASS = "shadow-md md:!h-32 md:!w-32";

/**
 * The corner glyph of a `DepartmentHero` panel (#1223 Phase 4a, R46, updated #1278):
 * displays genuine product photography for the department when an `imageUrl` is supplied,
 * falling back to the department illustration or neutral decorative glyph from `categoryIconName`.
 *
 * #1288 R17: every branch is the circular `IconMedallion`, the same frame the department strip
 * and every icon use.
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
  const glyphName = categoryIconName(slug);

  if (imageUrl) {
    return (
      <IconMedallion
        imageUrl={imageUrl}
        fallbackIcon={glyphName}
        size={GLYPH_SIZE}
        loading={loading}
        className={GLYPH_CLASS}
        decorative
      />
    );
  }

  const icon3D = use3D ? department3DIcon(slug) : null;
  if (icon3D) {
    return <IconMedallion icon3d={icon3D} size={GLYPH_SIZE} className={GLYPH_CLASS} decorative />;
  }

  const src = departmentIllustration(slug);
  if (src) {
    return (
      <IconMedallion
        imageUrl={src}
        imageFit="inset"
        fallbackIcon={glyphName}
        size={GLYPH_SIZE}
        loading={loading}
        className={GLYPH_CLASS}
        decorative
      />
    );
  }

  return <IconMedallion icon={glyphName} size={GLYPH_SIZE} className={GLYPH_CLASS} decorative />;
}
