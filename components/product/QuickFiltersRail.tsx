import Link from "next/link";
import { filterEntries, type FilterParams } from "./filter-params";
import type { AvailableFacets } from "@/lib/repositories/products";

interface QuickPillConfig {
  key: string;
  label: string;
  count?: number;
  available: boolean;
}

function buildToggleHref(
  basePath: string,
  params: FilterParams & { q?: string; sort?: string },
  key: string,
  isActive: boolean,
): string {
  const qs = new URLSearchParams();
  if (typeof params.q === "string" && params.q !== "") {
    qs.set("q", params.q);
  }
  if (typeof params.sort === "string" && params.sort !== "") {
    qs.set("sort", params.sort);
  }
  for (const [k, value] of filterEntries(params, [key, "cursor", "back"])) {
    qs.append(k, value);
  }
  if (!isActive) {
    qs.set(key, "1");
  }
  const query = qs.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function QuickFiltersRail({
  basePath,
  params,
  facets,
}: {
  basePath: string;
  params: FilterParams & { q?: string; sort?: string };
  facets?: AvailableFacets;
}) {
  const spec = facets ?? {
    halal: false,
    fresh: false,
    organic: false,
    vegetarian: false,
    glutenFree: false,
    hmcCertified: false,
    onOffer: false,
    origins: [],
    brands: [],
    packSizes: [],
    attributes: [],
  };

  const pills: QuickPillConfig[] = [
    {
      key: "onOffer",
      label: "On offer",
      count: spec.onOfferCount,
      available: spec.onOffer || params.onOffer === "1",
    },
    {
      key: "inStock",
      label: "In stock",
      count: spec.inStockCount,
      available: true,
    },
    {
      key: "isHalal",
      label: "Halal",
      count: spec.halalCount,
      available: spec.halal || params.isHalal === "1",
    },
    {
      key: "isFresh",
      label: "Fresh",
      count: spec.freshCount,
      available: spec.fresh || params.isFresh === "1",
    },
    {
      key: "isOrganic",
      label: "Organic",
      count: spec.organicCount,
      available: spec.organic || params.isOrganic === "1",
    },
    {
      key: "isVegetarian",
      label: "Vegetarian",
      count: spec.vegetarianCount,
      available: spec.vegetarian || params.isVegetarian === "1",
    },
    {
      key: "isGlutenFree",
      label: "Gluten free",
      count: spec.glutenFreeCount,
      available: spec.glutenFree || params.isGlutenFree === "1",
    },
  ];

  const visiblePills = pills.filter((p) => p.available);
  if (visiblePills.length === 0) return null;

  return (
    <nav
      aria-label="Quick filters"
      className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-primary-muted shrink-0 mr-1">
        Quick filters:
      </span>
      {visiblePills.map((pill) => {
        const isActive = params[pill.key] === "1";
        const href = buildToggleHref(basePath, params, pill.key, isActive);
        return (
          <Link
            key={pill.key}
            href={href}
            aria-pressed={isActive}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-action text-white shadow-xs hover:bg-action-hover"
                : "border border-black/15 bg-white text-primary hover:border-black/30 hover:bg-surface-muted"
            }`}
          >
            <span>{pill.label}</span>
            {pill.count !== undefined && !isActive && (
              <span className="text-primary-muted font-normal text-[11px]">({pill.count})</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
