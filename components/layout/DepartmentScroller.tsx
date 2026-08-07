"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { categoryIcon } from "@/components/product/category-icon";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * Horizontal, icon-led department strip that scrolls via ‹ › arrow buttons
 * (the scrollbar is hidden — see .no-scrollbar in globals.css). A client
 * component because the arrows drive `scrollBy`; without JS the strip still
 * scrolls natively by touch/trackpad, so it degrades gracefully. Data comes
 * from the server as props (like ProductCard), not fetched here.
 */
export function DepartmentScroller({
  categories,
  activeSlug = null,
}: {
  categories: CategorySummary[];
  activeSlug?: string | null;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const nudge = (direction: 1 | -1) =>
    trackRef.current?.scrollBy({ left: direction * 260, behavior: "smooth" });

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Scroll departments left"
        onClick={() => nudge(-1)}
        className="absolute left-0 top-8 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-primary shadow hover:bg-surface-muted"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>

      <div ref={trackRef} className="no-scrollbar flex gap-4 overflow-x-auto scroll-smooth px-6">
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
              <span
                className={`flex h-16 w-16 items-center justify-center rounded-full bg-action-tint transition group-hover:ring-2 group-hover:ring-action/40 ${
                  isActive ? "ring-2 ring-action/60" : ""
                }`}
              >
                <Icon className="h-7 w-7 text-primary" aria-hidden />
              </span>
              <span className="line-clamp-2 text-xs font-medium leading-tight text-primary">
                {category.name}
              </span>
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Scroll departments right"
        onClick={() => nudge(1)}
        className="absolute right-0 top-8 z-10 flex h-8 w-8 translate-x-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-primary shadow hover:bg-surface-muted"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
