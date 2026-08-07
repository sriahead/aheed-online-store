import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryRepository } from "@/lib/repositories/categories";
import { getProductRepository } from "@/lib/repositories/products";
import { getEnv } from "@/lib/config";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductFilterForm } from "@/components/product/ProductFilterForm";
import { CategorySidebar } from "@/components/layout/CategorySidebar";
import { parsePriceInput } from "@/components/product/parse-price-input";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

type SearchParams = {
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  isHalal?: string;
  isFresh?: string;
  isOrganic?: string;
  cursor?: string;
};

function nextPageHref(slug: string, params: SearchParams, cursor: string): string {
  const qs = new URLSearchParams();
  if (params.minPrice) qs.set("minPrice", params.minPrice);
  if (params.maxPrice) qs.set("maxPrice", params.maxPrice);
  if (params.inStock) qs.set("inStock", params.inStock);
  if (params.isHalal) qs.set("isHalal", params.isHalal);
  if (params.isFresh) qs.set("isFresh", params.isFresh);
  if (params.isOrganic) qs.set("isOrganic", params.isOrganic);
  qs.set("cursor", cursor);
  return `/categories/${slug}?${qs.toString()}`;
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const categoryRepo = getCategoryRepository();
  const [category, allCategories] = await Promise.all([
    categoryRepo.getBySlug(slug),
    categoryRepo.listTopLevel(),
  ]);
  if (!category) {
    notFound();
  }

  const { items, nextCursor } = await getProductRepository().listByCategory(category.id, {
    take: PAGE_SIZE,
    cursor: query.cursor,
    minPricePence: parsePriceInput(query.minPrice ?? ""),
    maxPricePence: parsePriceInput(query.maxPrice ?? ""),
    inStockOnly: query.inStock === "1",
    isHalal: query.isHalal === "1",
    isFresh: query.isFresh === "1",
    isOrganic: query.isOrganic === "1",
  });
  const { CDN_BASE_URL } = getEnv();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:flex-row">
      <CategorySidebar categories={allCategories} activeSlug={slug} />
      <div className="flex-1">
        <h1 className="mb-6 text-2xl font-semibold text-primary">{category.name}</h1>
        <ProductFilterForm searchParams={query} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} cdnBaseUrl={CDN_BASE_URL ?? ""} />
          ))}
        </div>
        {nextCursor && (
          <Link
            href={nextPageHref(slug, query, nextCursor)}
            className="mt-6 inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
          >
            Next page
          </Link>
        )}
      </div>
    </main>
  );
}
