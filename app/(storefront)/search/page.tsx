import Link from "next/link";
import { getProductRepository } from "@/lib/repositories/products";
import { getEnv } from "@/lib/config";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductFilterForm } from "@/components/product/ProductFilterForm";
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
  cursor?: string;
};

function nextPageHref(params: SearchParams, cursor: string): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.minPrice) qs.set("minPrice", params.minPrice);
  if (params.maxPrice) qs.set("maxPrice", params.maxPrice);
  if (params.inStock) qs.set("inStock", params.inStock);
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

  let items: Awaited<ReturnType<ReturnType<typeof getProductRepository>["search"]>>["items"] = [];
  let nextCursor: string | null = null;

  if (query) {
    const result = await getProductRepository().search(query, {
      take: PAGE_SIZE,
      cursor: params.cursor,
      minPricePence: parsePriceInput(params.minPrice ?? ""),
      maxPricePence: parsePriceInput(params.maxPrice ?? ""),
      inStockOnly: params.inStock === "1",
    });
    items = result.items;
    nextCursor = result.nextCursor;
  }

  const { CDN_BASE_URL } = getEnv();

  return (
    <main className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Search</h1>
      <ProductFilterForm showQuery searchParams={params} />
      {query && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
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
    </main>
  );
}
