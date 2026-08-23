import Link from "next/link";
import { Star } from "lucide-react";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
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
      className="group relative bg-white rounded-2xl border border-black/10 hover:border-action/50 hover:shadow-2xl hover:-translate-y-1 transition duration-300 flex flex-col overflow-hidden cursor-pointer h-full"
    >
      {/* Top badges */}
      <div className="absolute top-2.5 left-2.5 z-10 flex flex-wrap gap-1">
        {product.isHalal && (
          <span className="bg-primary text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-action-tint"></span>
            Halal
          </span>
        )}
        {product.isFresh && (
          <span className="bg-action text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm">
            Fresh
          </span>
        )}
        {hasDiscount && (
          <span className="bg-accent text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm">
            Offer
          </span>
        )}
      </div>

      {/* Image container */}
      <div className="relative aspect-4/3 w-full bg-surface-muted overflow-hidden shrink-0">
        {product.primaryImage ? (
          // P7d (#218/#46): intrinsic dimensions so the browser can reserve the box before
          // the bytes land. CSS still drives layout (w-full/h-full inside the aspect-4/3
          // container) — these attributes only supply the aspect ratio.
          <img
            src={composePublicUrl(cdnBaseUrl, product.primaryImage.storageKey)}
            alt={product.primaryImage.alt}
            width={400}
            height={300}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-surface-muted" />
        )}
        {hasDiscount && (
          <div className="absolute bottom-2 right-2 bg-danger text-white text-[11px] font-bold px-1.5 py-0.5 rounded">
            Save {formatPrice(saving)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 flex flex-col flex-1 justify-between">
        <div>
          {/* Rating & Origin */}
          <div className="flex items-center justify-between text-xs text-black/60 mb-1">
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" aria-hidden />
              <span className="font-medium text-black/70">{product.averageRating.toFixed(1)}</span>
              <span>({product.reviewCount})</span>
            </div>
            {product.origin && (
              <span className="text-[11px] truncate max-w-[100px]" title={product.origin}>
                {product.origin}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="font-semibold text-black/90 text-sm group-hover:text-primary transition-colors line-clamp-2 leading-tight">
            {product.name}
          </h3>

          <p className="text-xs text-black/60 mt-0.5">{product.unitLabel}</p>
        </div>

        {/* Price & Add Button */}
        <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-black/5">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-base font-bold text-primary">
              {formatPrice(product.basePrice)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-black/60 line-through">
                {formatPrice(product.originalPrice!)}
              </span>
            )}
          </div>

          <AddToCartButton
            productId={product.id}
            disabled={!product.inStock}
            label={`Add ${product.name} to cart`}
            variant="card"
          />
        </div>
      </div>
    </Link>
  );
}
