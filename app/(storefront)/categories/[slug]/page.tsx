import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryRepository } from "@/lib/repositories/categories";
import { getProductRepository } from "@/lib/repositories/products";
import { getEnv } from "@/lib/config";
import { ProductCard } from "@/components/product/ProductCard";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { slug } = await params;
  const { cursor } = await searchParams;

  const category = await getCategoryRepository().getBySlug(slug);
  if (!category) {
    notFound();
  }

  const { items, nextCursor } = await getProductRepository().listByCategory(category.id, {
    take: PAGE_SIZE,
    cursor,
  });
  const { CDN_BASE_URL } = getEnv();

  return (
    <main className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold text-primary">{category.name}</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} cdnBaseUrl={CDN_BASE_URL ?? ""} />
        ))}
      </div>
      {nextCursor && (
        <Link
          href={`/categories/${slug}?cursor=${nextCursor}`}
          className="mt-6 inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
        >
          Next page
        </Link>
      )}
    </main>
  );
}
