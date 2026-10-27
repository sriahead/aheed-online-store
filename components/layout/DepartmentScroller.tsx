"use client";

import Link from "next/link";
import { categoryIconName } from "@/components/product/category-icon";
import { IconMedallion } from "@/components/icons/IconMedallion";
import { departmentIllustration, department3DIcon } from "@/components/icons/illustrations";
import { HorizontalScroller } from "@/components/layout/HorizontalScroller";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * Horizontal, photograph-led department strip (#1278).
 *
 * Each category renders a real commercial studio product photograph (Tesco reference model),
 * dynamically supplied via `category.imageUrl` (falling back to `/images/categories/${category.slug}.jpg`).
 * Synthetic 3D vector icons and generic illustrations are replaced with authentic product packshots.
 *
 * If a category photograph is missing or fails to load, `ImageWithFallback` degrades cleanly
 * to the semantic vector icon (`categoryIconName`). The first six images load eagerly, the rest lazily.
 */
const EAGER_PHOTOGRAPHS = 6;
/** The tile's 64 px (`h-16 w-16`) frame, unchanged by #1288. */
const TILE_SIZE = 64;

export function DepartmentScroller({
  categories,
  activeSlug = null,
  use3D = false,
}: {
  categories: CategorySummary[];
  activeSlug?: string | null;
  use3D?: boolean;
}) {
  return (
    <HorizontalScroller
      itemLabel="departments"
      step={260}
      arrowPositionClassName="top-6.5 lg:top-8"
      itemWidthClassName="px-6"
    >
      {categories.map((category, index) => {
        const isActive = category.slug === activeSlug;
        const glyphName = categoryIconName(category.slug);
        const loading = index < EAGER_PHOTOGRAPHS ? "eager" : "lazy";

        // Realistic product photography (Tesco model, #1278)
        const photoUrl = category.imageUrl;
        const icon3D = use3D ? department3DIcon(category.slug) : null;
        const illustration = departmentIllustration(category.slug);

        // #1288 R17: one circular, single-tint medallion whatever the tile shows.
        const medallionClass =
          "transition duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-action/30 group-hover:shadow-md";

        return (
          <Link
            key={category.id}
            href={`/categories/${category.slug}`}
            aria-current={isActive ? "page" : undefined}
            className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center"
          >
            {photoUrl ? (
              <IconMedallion
                imageUrl={photoUrl}
                fallbackIcon={glyphName}
                size={TILE_SIZE}
                tint="action"
                active={isActive}
                loading={loading}
                className={medallionClass}
                decorative
              />
            ) : icon3D ? (
              <IconMedallion
                icon3d={icon3D}
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
                loading={loading}
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
            <span className="line-clamp-2 text-xs font-medium leading-tight text-primary">
              {category.name}
            </span>
          </Link>
        );
      })}
    </HorizontalScroller>
  );
}
