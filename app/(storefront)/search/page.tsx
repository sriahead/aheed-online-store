import Link from "next/link";
import { getProductRepository } from "@/lib/products-service";
import { getCategoryRepository } from "@/lib/categories-service";
import { getEnv } from "@/lib/config";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductFilterForm } from "@/components/product/ProductFilterForm";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { parsePriceInput } from "@/components/product/parse-price-input";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

export const metadata = { title: "Search — Aheed Food Centre" };

const PAGE_SIZE = 12;

type SearchParams = {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  isHalal?: string;
  isFresh?: string;
  isOrganic?: string;
  cursor?: string;
};

function nextPageHref(params: SearchParams, cursor: string): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.minPrice) qs.set("minPrice", params.minPrice);
  if (params.maxPrice) qs.set("maxPrice", params.maxPrice);
  if (params.inStock) qs.set("inStock", params.inStock);
  if (params.isHalal) qs.set("isHalal", params.isHalal);
  if (params.isFresh) qs.set("isFresh", params.isFresh);
  if (params.isOrganic) qs.set("isOrganic", params.isOrganic);
  qs.set("cursor", cursor);
  return `/search?${qs.toString()}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  const allCategories = await getCategoryRepository().listTopLevel();

  let items: Awaited<ReturnType<ReturnType<typeof getProductRepository>["search"]>>["items"] = [];
  let nextCursor: string | null = null;

  const products = getProductRepository();
  if (query) {
    const result = await products.search(query, {
      take: PAGE_SIZE,
      cursor: params.cursor,
      minPricePence: parsePriceInput(params.minPrice ?? ""),
      maxPricePence: parsePriceInput(params.maxPrice ?? ""),
      inStockOnly: params.inStock === "1",
      isHalal: params.isHalal === "1",
      isFresh: params.isFresh === "1",
      isOrganic: params.isOrganic === "1",
    });
    items = result.items;
    nextCursor = result.nextCursor;
  }
  const specialities = await products.availableSpecialities();

  const { CDN_BASE_URL } = getEnv();

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* Departments: horizontal strip on top (arrow-scrolled). */}
      <DepartmentScroller categories={allCategories} activeSlug={null} />

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        {/* Search & filters: vertical sidebar on the left. */}
        <aside className="shrink-0 md:w-60">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary/60">
            Search &amp; filters
          </h2>
          <ProductFilterForm showQuery searchParams={params} specialities={specialities} />
        </aside>

        <div className="flex-1">
          <h1 className="mb-6 text-2xl font-semibold text-primary">Search</h1>
          {query && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} cdnBaseUrl={CDN_BASE_URL ?? ""} />
              ))}
            </div>
          )}
          {nextCursor && (
            <Link
              href={nextPageHref(params, nextCursor)}
              className="mt-6 inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
            >
              Next page
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
