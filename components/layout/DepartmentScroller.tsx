"use client";

import Link from "next/link";
import { categoryIcon } from "@/components/product/category-icon";
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
 */
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
      arrowPositionClassName="top-8"
      itemWidthClassName="px-6"
    >
      {categories.map((category) => {
        const Icon = categoryIcon(category.slug);
        const isActive = category.slug === activeSlug;
        return (
          <Link
            key={category.id}
            href={`/categories/${category.slug}`}
            aria-current={isActive ? "page" : undefined}
            className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center"
          >
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full bg-action-tint transition duration-300 group-hover:scale-110 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-action/40 group-hover:shadow-lg ${
                isActive ? "ring-2 ring-action/60" : ""
              }`}
            >
              <Icon className="h-7 w-7 text-primary" aria-hidden />
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
