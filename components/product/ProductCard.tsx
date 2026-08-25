import Link from "next/link";
import { AlertTriangle, Star } from "lucide-react";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { CartQuantityStepper } from "@/components/cart/CartQuantityStepper";
import { composePublicUrl } from "@/lib/storage";
import { formatPrice } from "./format-price";
import type { ProductSummary } from "@/lib/repositories/products";

/**
 * P8.5a (#345) — the skewed card.
 *
 * Geometry lives in `app/globals.css` (`.skew-card*`), not in Tailwind classes,
 * because the counter-skew is a parent/child relationship rather than a set of
 * utilities: the card skews and every `.skew-card-inner` inside it skews back.
 * That file also carries the reduced-motion opt-out and the reasoning for both.
 *
 * `cartQuantity` comes from the page's request-memoised cart read
 * (`lib/cart-summary.ts`), so a grid of these costs no extra query — the header
 * on the same page already resolved the cart.
 */
export function ProductCard({
  product,
  cdnBaseUrl,
  cartQuantity = 0,
}: {
  product: ProductSummary;
  cdnBaseUrl: string;
  /** Quantity of this product currently in the cart; 0 when it isn't. */
  cartQuantity?: number;
}) {
  const hasDiscount = product.originalPrice != null && product.originalPrice > product.basePrice;
  const saving = hasDiscount ? product.originalPrice! - product.basePrice : 0;
  // Only meaningful while there is still stock to run out of — a zero-stock
  // product renders the out-of-stock control instead, and "Only 0 left" would
  // be both wrong and alarming.
  const isLowStock =
    product.inStock &&
    product.stockQuantity > 0 &&
    product.stockQuantity <= product.lowStockThreshold;

  return (
    <div className="skew-card-wrap h-full">
      <Link
        href={`/products/${product.slug}`}
        className="skew-card group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-black/10 bg-white hover:border-action/50"
      >
        {/* Top badges */}
        <div className="absolute top-2.5 left-2.5 z-10 flex flex-wrap gap-1">
          {product.isHalal && (
            <span className="skew-card-badge flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-action-tint"></span>
              Halal
            </span>
          )}
          {product.isFresh && (
            <span className="skew-card-badge rounded-full bg-action px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              Fresh
            </span>
          )}
          {hasDiscount && (
            <span className="skew-card-badge rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              Offer
            </span>
          )}
        </div>

        {/* Image container */}
        <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden bg-surface-muted">
          <div className="skew-card-inner h-full w-full">
            {product.primaryImage ? (
              // P7d (#218/#46): intrinsic dimensions so the browser can reserve the box before
              // the bytes land. CSS still drives layout (w-full/h-full inside the aspect-4/3
              // container) — these attributes only supply the aspect ratio.
              <img
                src={composePublicUrl(cdnBaseUrl, product.primaryImage.storageKey)}
                alt={product.primaryImage.alt}
                width={400}
                height={300}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="h-full w-full bg-surface-muted" />
            )}
          </div>
          {hasDiscount && (
            <div className="skew-card-badge absolute right-2 bottom-2 rounded bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">
              Save {formatPrice(saving)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="skew-card-inner flex flex-1 flex-col justify-between p-3.5">
          <div>
            {/* Rating & Origin */}
            <div className="mb-1 flex items-center justify-between text-xs text-black/60">
              <div className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                <span className="font-medium text-black/70">
                  {product.averageRating.toFixed(1)}
                </span>
                <span>({product.reviewCount})</span>
              </div>
              {product.origin && (
                <span className="max-w-[100px] truncate text-[11px]" title={product.origin}>
                  {product.origin}
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="line-clamp-2 text-sm leading-tight font-semibold text-black/90 transition-colors group-hover:text-primary">
              {product.name}
            </h3>

            <p className="mt-0.5 text-xs text-black/60">{product.unitLabel}</p>

            {isLowStock && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-danger">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Only {product.stockQuantity} left
              </p>
            )}
          </div>

          {/* Price & cart controls */}
          <div className="mt-3 flex flex-col gap-2 border-t border-black/5 pt-2">
            <div className="skew-card-price flex flex-wrap items-baseline gap-1.5">
              <span className="text-base font-bold text-primary">
                {formatPrice(product.basePrice)}
              </span>
              {hasDiscount && (
                <span className="text-xs text-black/60 line-through">
                  {formatPrice(product.originalPrice!)}
                </span>
              )}
            </div>

            {/*
              In the cart -> the stepper mutates it. Not in the cart -> the
              existing add control, unchanged. An out-of-stock product always
              gets the disabled add control and never a stepper (R13).
            */}
            {product.inStock && cartQuantity > 0 ? (
              <CartQuantityStepper
                productId={product.id}
                quantity={cartQuantity}
                stock={product.stockQuantity}
                productName={product.name}
              />
            ) : (
              <AddToCartButton
                productId={product.id}
                disabled={!product.inStock}
                label={`Add ${product.name} to cart`}
                variant="card"
              />
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
