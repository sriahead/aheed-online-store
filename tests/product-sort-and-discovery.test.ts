import { describe, expect, it, vi } from "vitest";
import {
  parseSortOption,
  isProductSortOption,
  SORT_OPTIONS,
  SORT_OPTION_LABELS,
} from "@/components/product/sort-params";
import { activeFilterChips, clearAllHref } from "@/components/product/filter-chips";
import { searchPageHref, categoryFilterHref } from "@/components/product/search-href";
import { nextCategoryPageHref, prevCategoryPageHref } from "@/components/product/category-href";

describe("sort-params (#1424)", () => {
  it("validates recognized sort options and provides human labels", () => {
    expect(isProductSortOption("price_asc")).toBe(true);
    expect(isProductSortOption("price_desc")).toBe(true);
    expect(isProductSortOption("unit_price_asc")).toBe(true);
    expect(isProductSortOption("rating_desc")).toBe(true);
    expect(isProductSortOption("newest")).toBe(true);
    expect(isProductSortOption("relevance")).toBe(true);
    expect(isProductSortOption("invalid_sort")).toBe(false);

    for (const opt of SORT_OPTIONS) {
      expect(SORT_OPTION_LABELS[opt]).toBeDefined();
    }
  });

  it("parseSortOption falls back to default when raw is unknown or empty", () => {
    expect(parseSortOption("price_asc", "newest")).toBe("price_asc");
    expect(parseSortOption("bogus", "newest")).toBe("newest");
    expect(parseSortOption(undefined, "relevance")).toBe("relevance");
    expect(parseSortOption(null, "newest")).toBe("newest");
  });
});

describe("sort parameter URL preservation across navigation (#1424)", () => {
  const params = {
    q: "rice",
    sort: "price_asc",
    isHalal: "1",
    minPrice: "2",
  };

  it("preserves sort across searchPageHref pagination", () => {
    const href = searchPageHref(params, "cursor-123");
    const qs = new URLSearchParams(href.split("?")[1]);
    expect(qs.get("sort")).toBe("price_asc");
    expect(qs.get("q")).toBe("rice");
    expect(qs.get("isHalal")).toBe("1");
    expect(qs.get("cursor")).toBe("cursor-123");
  });

  it("preserves sort across categoryFilterHref department drilling", () => {
    const href = categoryFilterHref(params, "spices");
    const qs = new URLSearchParams(href.split("?")[1]);
    expect(qs.get("sort")).toBe("price_asc");
    expect(qs.get("category")).toBe("spices");
    expect(qs.get("q")).toBe("rice");
  });

  it("preserves sort across nextCategoryPageHref and prevCategoryPageHref", () => {
    const nextHref = nextCategoryPageHref("grains", params, "cursor-next");
    const nextQs = new URLSearchParams(nextHref.split("?")[1]);
    expect(nextQs.get("sort")).toBe("price_asc");
    expect(nextQs.get("cursor")).toBe("cursor-next");

    const prevHref = prevCategoryPageHref("grains", { ...params, back: "c1,c2", cursor: "c3" });
    const prevQs = new URLSearchParams(prevHref.split("?")[1]);
    expect(prevQs.get("sort")).toBe("price_asc");
    expect(prevQs.get("cursor")).toBe("c2");
  });

  it("never renders sort as a removable filter chip, but preserves it on chip removal", () => {
    const chips = activeFilterChips("/categories/grains", params);
    const chipKeys = chips.map((c) => c.key);
    expect(chipKeys).not.toContain("sort");
    expect(chipKeys).toContain("isHalal");
    expect(chipKeys).toContain("minPrice");

    for (const chip of chips) {
      const qs = new URLSearchParams(chip.href.split("?")[1]);
      expect(qs.get("sort")).toBe("price_asc");
      expect(qs.has(chip.key)).toBe(false);
    }
  });

  it("preserves sort order when clicking Clear all filters", () => {
    const clearHref = clearAllHref("/categories/grains", params);
    const qs = new URLSearchParams(clearHref.split("?")[1]);
    expect(qs.get("sort")).toBe("price_asc");
    expect(qs.has("isHalal")).toBe(false);
    expect(qs.has("minPrice")).toBe(false);
  });
});

describe("repository sorting (#1424)", () => {
  const VENDOR = "v-test";

  function stubRow(
    i: number,
    over: Partial<{ basePrice: number; averageRating: number; reviewCount: number }> = {},
  ) {
    return {
      id: `p${String(i).padStart(3, "0")}`,
      slug: `product-${i}`,
      name: `Basmati Rice ${i}`,
      basePrice: over.basePrice ?? 100 + i,
      unitLabel: "each",
      netContentAmount: null,
      netContentUnit: null,
      origin: null,
      originalPrice: null,
      isHalal: false,
      isFresh: false,
      isOrganic: false,
      isVegetarian: false,
      isGlutenFree: false,
      isHmcCertified: false,
      brand: null,
      averageRating: over.averageRating ?? 0,
      reviewCount: over.reviewCount ?? 0,
      images: [] as { storageKey: string; alt: string; isPrimary: boolean }[],
      inventory: { quantity: 10, lowStockThreshold: 2 },
      attributeValues: [] as never[],
    };
  }

  it("passes correct orderBy to Prisma in listProducts for each sort option", async () => {
    const { listProducts } = await import("@/lib/repositories/products");
    const captured: unknown[] = [];
    const client = {
      product: {
        findMany: vi.fn(async (args: unknown) => {
          captured.push(args);
          return [stubRow(1)];
        }),
      },
      productPriceTier: { findMany: vi.fn(async () => []) },
    } as never;

    await listProducts(client, VENDOR, { take: 12, sort: "price_asc" });
    expect((captured[0] as { orderBy: unknown }).orderBy).toEqual([
      { basePrice: "asc" },
      { id: "asc" },
    ]);

    await listProducts(client, VENDOR, { take: 12, sort: "price_desc" });
    expect((captured[1] as { orderBy: unknown }).orderBy).toEqual([
      { basePrice: "desc" },
      { id: "desc" },
    ]);

    await listProducts(client, VENDOR, { take: 12, sort: "unit_price_asc" });
    expect((captured[2] as { orderBy: unknown }).orderBy).toEqual([
      { unitPricePencePerBaseUnit: { sort: "asc", nulls: "last" } },
      { basePrice: "asc" },
      { id: "asc" },
    ]);

    await listProducts(client, VENDOR, { take: 12, sort: "rating_desc" });
    expect((captured[3] as { orderBy: unknown }).orderBy).toEqual([
      { averageRating: "desc" },
      { reviewCount: "desc" },
      { id: "desc" },
    ]);

    await listProducts(client, VENDOR, { take: 12, sort: "newest" });
    expect((captured[4] as { orderBy: unknown }).orderBy).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("sorts search candidates in memory when an explicit sort is provided", async () => {
    const { searchProducts } = await import("@/lib/repositories/products");
    const candidateRows = [
      stubRow(1, { basePrice: 500, averageRating: 4.5, reviewCount: 10 }),
      stubRow(2, { basePrice: 200, averageRating: 3.0, reviewCount: 5 }),
      stubRow(3, { basePrice: 350, averageRating: 5.0, reviewCount: 20 }),
    ];
    const client = {
      product: {
        findMany: vi.fn(async () => candidateRows),
        findFirst: vi.fn(async () => null),
      },
      productPriceTier: { findMany: vi.fn(async () => []) },
      searchSynonym: { findMany: vi.fn(async () => []) },
    } as never;

    const lowToHigh = await searchProducts(client, VENDOR, "rice", { take: 12, sort: "price_asc" });
    expect(lowToHigh.items.map((p) => p.basePrice)).toEqual([200, 350, 500]);

    const highToLow = await searchProducts(client, VENDOR, "rice", {
      take: 12,
      sort: "price_desc",
    });
    expect(highToLow.items.map((p) => p.basePrice)).toEqual([500, 350, 200]);

    const topRated = await searchProducts(client, VENDOR, "rice", {
      take: 12,
      sort: "rating_desc",
    });
    expect(topRated.items.map((p) => p.averageRating)).toEqual([5.0, 4.5, 3.0]);
  });
});
