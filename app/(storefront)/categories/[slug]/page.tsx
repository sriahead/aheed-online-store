import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryRepository } from "@/lib/repositories/categories";
import { getProductRepository } from "@/lib/repositories/products";
import { getEnv } from "@/lib/config";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductFilterForm } from "@/components/product/ProductFilterForm";
import { parsePriceInput } from "@/components/product/parse-price-input";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

type SearchParams = { minPrice?: string; maxPrice?: string; inStock?: string; cursor?: string };

function nextPageHref(slug: string, params: SearchParams, cursor: string): string {
  const qs = new URLSearchParams();
  if (params.minPrice) qs.set("minPrice", params.minPrice);
  if (params.maxPrice) qs.set("maxPrice", params.maxPrice);
  if (params.inStock) qs.set("inStock", params.inStock);
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

  const category = await getCategoryRepository().getBySlug(slug);
  if (!category) {
    notFound();
  }

  const { items, nextCursor } = await getProductRepository().listByCategory(category.id, {
    take: PAGE_SIZE,
    cursor: query.cursor,
    minPricePence: parsePriceInput(query.minPrice ?? ""),
    maxPricePence: parsePriceInput(query.maxPrice ?? ""),
    inStockOnly: query.inStock === "1",
  });
  const { CDN_BASE_URL } = getEnv();

  return (
    <main className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold text-primary">{category.name}</h1>
      <ProductFilterForm searchParams={query} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
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
    </main>
  );
}
