import { notFound } from "next/navigation";
import { getProductRepository } from "@/lib/repositories/products";
import { getEnv } from "@/lib/config";
import { formatPrice } from "@/components/product/format-price";
import { ProductImageGallery } from "@/components/product/ProductImageGallery";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductRepository().getBySlug(slug);
  if (!product) {
    notFound();
  }

  const { CDN_BASE_URL } = getEnv();

  return (
    <main className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
      <ProductImageGallery images={product.images} cdnBaseUrl={CDN_BASE_URL ?? ""} />
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-primary">{product.name}</h1>
        <p className="text-primary/80">{product.description}</p>
        <p className="text-sm text-primary/70">{product.unitLabel}</p>
        <p className="text-xl font-semibold text-action">{formatPrice(product.basePrice)}</p>
        <p className={product.inStock ? "text-action" : "text-danger"}>
          {product.inStock ? "In stock" : "Out of stock"}
        </p>
      </div>
    </main>
  );
}
