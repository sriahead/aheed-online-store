"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  parentId: string | null;
  parentName: string | null;
  productCount: number;
};

export function CategoryListClient({ categories }: { categories: CategoryItem[] }) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
        <FolderTree className="mx-auto mb-3 h-8 w-8 text-primary-subtle" aria-hidden />
        <p className="text-sm text-primary-muted">
          No categories yet. Create one before adding products.
        </p>
      </div>
    );
  }

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const hasChildren = (id: string) => categories.some((c) => c.parentId === id);

  return (
    <ul className="space-y-2">
      {categories.map((category) => {
        const isHidden = category.parentId && collapsedIds.has(category.parentId);
        if (isHidden) return null;

        const isParent = !category.parentId && hasChildren(category.id);
        const isCollapsed = collapsedIds.has(category.id);

        return (
          <li
            key={category.id}
            className={`rounded-2xl border border-black/10 bg-white p-4 ${
              category.parentId ? "ml-6" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                {isParent && (
                  <button
                    type="button"
                    onClick={() => toggleCollapse(category.id)}
                    className="mt-0.5 rounded-md text-primary-muted hover:bg-surface-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-action"
                    aria-label={isCollapsed ? "Expand category" : "Collapse category"}
                    aria-expanded={!isCollapsed}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-5 w-5" aria-hidden />
                    ) : (
                      <ChevronDown className="h-5 w-5" aria-hidden />
                    )}
                  </button>
                )}
                {!isParent && !category.parentId && <div className="w-5 h-5 shrink-0" aria-hidden />}
                <div>
                  <p className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/staff/categories/${category.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {category.name}
                    </Link>
                    {!category.isActive && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-muted">
                        Hidden
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-primary-muted">
                    {category.parentName ? `in ${category.parentName} · ` : ""}
                    {category.slug}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-xs text-primary-muted">
                {category.productCount} {category.productCount === 1 ? "product" : "products"}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
