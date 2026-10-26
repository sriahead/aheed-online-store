"use client";

import Link from "next/link";
import { categoryIconName } from "@/components/product/category-icon";
import { Icon } from "@/components/icons/Icon";
import { Icon3D } from "@/components/icons/Icon3D";
import { departmentIllustration, department3DIcon } from "@/components/icons/illustrations";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
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
        const glyph = (
          <Icon name={categoryIconName(category.slug)} className="h-7 w-7 text-primary" />
        );

        // Realistic product photography (Tesco model, #1278)
        const photoUrl = category.imageUrl;
        const icon3D = use3D ? department3DIcon(category.slug) : null;
        const illustration = departmentIllustration(category.slug);
        const isPhoto = Boolean(photoUrl);

        return (
          <Link
            key={category.id}
            href={`/categories/${category.slug}`}
            aria-current={isActive ? "page" : undefined}
            className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center"
          >
            <div
              className={`flex h-16 w-16 items-center justify-center ${
                isPhoto
                  ? "overflow-hidden rounded-2xl border border-black/10 bg-white p-1.5 shadow-xs"
                  : `rounded-full ${index % 2 === 0 ? "bg-action-tint" : "bg-accent-tint"}`
              } transition duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100 group-hover:-translate-y-1 group-hover:border-action/40 group-hover:ring-2 group-hover:ring-action/30 group-hover:shadow-md ${
                isActive ? "border-action ring-2 ring-action/50 shadow-sm" : ""
              }`}
            >
              {photoUrl ? (
                <ImageWithFallback
                  src={photoUrl}
                  alt=""
                  width={56}
                  height={56}
                  loading={index < EAGER_PHOTOGRAPHS ? "eager" : "lazy"}
                  decoding="async"
                  className="h-full w-full object-contain transition duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100"
                  fallback={glyph}
                />
              ) : icon3D ? (
                <Icon3D
                  name={icon3D}
                  size={46}
                  className="transition duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100"
                  decorative
                />
              ) : illustration ? (
                <ImageWithFallback
                  src={illustration}
                  alt=""
                  width={48}
                  height={48}
                  loading={index < EAGER_PHOTOGRAPHS ? "eager" : "lazy"}
                  decoding="async"
                  className="h-12 w-12"
                  fallback={glyph}
                />
              ) : (
                glyph
              )}
            </div>
            <span className="line-clamp-2 text-xs font-medium leading-tight text-primary">
              {category.name}
            </span>
          </Link>
        );
      })}
    </HorizontalScroller>
  );
}
