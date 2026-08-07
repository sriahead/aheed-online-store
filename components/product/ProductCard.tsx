import Link from "next/link";
import { Star, Plus } from "lucide-react";
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
  const hasDiscount = product.originalPrice != null && product.originalPrice > product.basePrice;
  const saving = hasDiscount ? product.originalPrice! - product.basePrice : 0;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-md border border-black/10 transition hover:border-black/20 hover:shadow-lg"
    >
      {/* Badges */}
      <div className="absolute left-2.5 top-2.5 z-10 flex flex-wrap gap-1">
        {product.isHalal && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
            Halal
          </span>
        )}
        {product.isFresh && (
          <span className="rounded-full bg-action px-2 py-0.5 text-[10px] font-semibold text-white">
            Fresh
          </span>
        )}
        {hasDiscount && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">
            Offer
          </span>
        )}
      </div>

      {/* Image */}
      <div className="relative aspect-square w-full bg-surface-muted">
        {product.primaryImage ? (
          <img
            src={composePublicUrl(cdnBaseUrl, product.primaryImage.storageKey)}
            alt={product.primaryImage.alt}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-surface-muted" />
        )}
        {hasDiscount && (
          <span className="absolute bottom-2 right-2 rounded-sm bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">
            Save {formatPrice(saving)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        {/* Rating + origin */}
        <div className="flex items-center justify-between text-xs text-primary/60">
          <span className="flex items-center gap-1">
            {/* Gold star: a decorative, non-brand color — stock Tailwind amber,
                per specs/design-system.md's "everything else uses Tailwind". */}
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
            <span className="font-medium text-primary/80">{product.averageRating.toFixed(1)}</span>
            <span>({product.reviewCount})</span>
          </span>
          {product.origin && (
            <span className="max-w-[45%] truncate" title={product.origin}>
              {product.origin}
            </span>
          )}
        </div>

        <span className="font-semibold leading-tight text-primary">{product.name}</span>
        <span className="text-xs text-primary/60">{product.unitLabel}</span>

        {/* Price + inert add button (P3 wires the cart) */}
        <div className="mt-2 flex items-center justify-between border-t border-black/5 pt-2">
          <span className="flex items-baseline gap-1.5">
            <span className="text-base font-bold text-primary">
              {formatPrice(product.basePrice)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-primary/40 line-through">
                {formatPrice(product.originalPrice!)}
              </span>
            )}
          </span>
          <span
            aria-hidden
            className="flex items-center justify-center rounded-full bg-primary p-2 text-white"
          >
            <Plus className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
