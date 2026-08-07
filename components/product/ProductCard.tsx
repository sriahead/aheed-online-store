import Link from "next/link";
import { composePublicUrl } from "@/lib/storage";
import { formatPrice } from "./format-price";
import type { ProductSummary } from "@/lib/repositories/products";

export function ProductCard({
  product,
  cdnBaseUrl,
}: {
  product: ProductSummary;
  cdnBaseUrl: string;
}) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="flex flex-col gap-2 rounded-md border border-black/10 p-3 hover:border-black/20"
    >
      {product.primaryImage ? (
        <img
          src={composePublicUrl(cdnBaseUrl, product.primaryImage.storageKey)}
          alt={product.primaryImage.alt}
          className="aspect-square w-full rounded-sm object-cover"
        />
      ) : (
        <div className="aspect-square w-full rounded-sm bg-surface-muted" />
      )}
      <span className="font-semibold text-primary">{product.name}</span>
      <span className="text-sm text-primary/70">{product.unitLabel}</span>
      <span className="font-semibold text-action">{formatPrice(product.basePrice)}</span>
    </Link>
  );
}
