/**
 * Storefront product sort options and helpers (#1424).
 *
 * Pure and unit-tested: no Prisma, no request context.
 *
 * Supported sort criteria:
 * - `newest`: Newest products first (browse default)
 * - `relevance`: Text search relevance (search default)
 * - `price_asc`: Lowest base price first
 * - `price_desc`: Highest base price first
 * - `unit_price_asc`: Best value per reference unit (kg / litre) first
 * - `rating_desc`: Highest customer rating first
 */

export type ProductSortOption =
  "newest" | "relevance" | "price_asc" | "price_desc" | "unit_price_asc" | "rating_desc";

export const SORT_OPTIONS: readonly ProductSortOption[] = [
  "newest",
  "relevance",
  "price_asc",
  "price_desc",
  "unit_price_asc",
  "rating_desc",
] as const;

export const SORT_OPTION_LABELS: Record<ProductSortOption, string> = {
  newest: "Newest first",
  relevance: "Most relevant",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
  unit_price_asc: "Best Value (per unit)",
  rating_desc: "Customer Rating",
};

export function isProductSortOption(value: unknown): value is ProductSortOption {
  return typeof value === "string" && (SORT_OPTIONS as readonly string[]).includes(value);
}

export function parseSortOption(
  raw: unknown,
  defaultSort: ProductSortOption = "newest",
): ProductSortOption {
  return isProductSortOption(raw) ? raw : defaultSort;
}
