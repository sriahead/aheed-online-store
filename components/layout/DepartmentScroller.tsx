"use client";

import Link from "next/link";
import { categoryIconName } from "@/components/product/category-icon";
import { Icon } from "@/components/icons/Icon";
import { departmentIllustration } from "@/components/icons/illustrations";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { HorizontalScroller } from "@/components/layout/HorizontalScroller";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * Horizontal, icon-led department strip.
 *
 * The scrolling behaviour moved to `HorizontalScroller` in #511, so the shop
 * page's product and bundle rows share one affordance with this strip rather
 * than the page showing one row that scrolls and three that do not. This file
 * keeps only what is department-specific: the icon tiles, the active state, and
 * its original arrow placement and 260px step, both passed explicitly so the
 * extraction changed nothing about how this strip feels.
 *
 * #1223 Phase 4a: a department with an illustration shows it (a static file through
 * `ImageWithFallback`, `h-12 w-12` inside the unchanged `h-16 w-16` tile) and any other department
 * keeps the neutral glyph, never a picture of food on a non-grocery shelf (#729). The tile tint
 * alternates by position so neighbouring tiles read apart. The first six images load eagerly, the
 * rest lazily.
 */
const EAGER_ILLUSTRATIONS = 6;

export function DepartmentScroller({
  categories,
  activeSlug = null,
}: {
  categories: CategorySummary[];
  activeSlug?: string | null;
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
        const illustration = departmentIllustration(category.slug);
        const glyph = (
          <Icon name={categoryIconName(category.slug)} className="h-7 w-7 text-primary" />
        );
        return (
          <Link
            key={category.id}
            href={`/categories/${category.slug}`}
            aria-current={isActive ? "page" : undefined}
            className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center"
          >
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full ${
                index % 2 === 0 ? "bg-action-tint" : "bg-accent-tint"
              } transition duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-action/40 group-hover:shadow-lg ${
                isActive ? "ring-2 ring-action/60" : ""
              }`}
            >
              {illustration ? (
                <ImageWithFallback
                  src={illustration}
                  alt=""
                  width={48}
                  height={48}
                  loading={index < EAGER_ILLUSTRATIONS ? "eager" : "lazy"}
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
