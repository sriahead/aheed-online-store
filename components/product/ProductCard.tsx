import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { CartQuantityStepper } from "@/components/cart/CartQuantityStepper";
import { Card } from "@/components/ui/Card";
import { ProductImage } from "./ProductImage";
import { ProductRating } from "./ProductRating";
import { composePublicUrl } from "@/lib/storage";
import { tierThresholdQuantity } from "@/lib/tier-pricing";
import { formatPrice } from "./format-price";
import { deriveUnitPriceLabel } from "./unit-price";
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
 *
 * #351/#656 — STRETCHED LINK, NOT A CARD-WIDE ANCHOR. `AddToCartButton` and
 * `CartQuantityStepper` render real `<button>` elements, and HTML forbids
 * interactive content inside `<a>`. The card used to wrap everything in one
 * `<Link>` and rely on every handler calling `preventDefault()`/
 * `stopPropagation()` to stop the click reaching the anchor — correctness
 * resting entirely on that discipline never lapsing. `Card`'s `variant="product"`
 * now carries `.skew-card` + `group` on a plain `<div>` (exactly the shape
 * `components/bundle/BundleCard.tsx` already uses in production), the title
 * is the only `<Link>` and covers the whole card via `after:absolute
 * after:inset-0` against `Card`'s `position: relative`, and the price/cart
 * controls are a SIBLING of that link carrying `relative z-10` so their
 * clicks land instead of being swallowed by the link's overlay — the standard
 * stretched-link technique. No JavaScript stopPropagation needed any more
 * (R13; `AddToCartButton`/`CartQuantityStepper` no longer call it).
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
  /**
   * P8.5d (#348) — the multi-buy tier, e.g. "3 for £10.00".
   *
   * A SEPARATE CLAIM FROM `hasDiscount` ABOVE, and deliberately rendered as one.
   * `originalPrice` is a single-unit markdown ("this £4.00 item is down from
   * £5.00"); a tier is a quantity offer ("three of them cost £10.00"). A product
   * can carry both, and they describe different things — so no figure is counted
   * in both places: the markdown keeps its "Save £X" image badge and its
   * struck-through price, and the tier gets its own badge in the price row
   * naming a quantity. Collapsing them into one "saving" would state something
   * false for whichever shopper isn't buying the group quantity.
   */
  const tierQuantity = tierThresholdQuantity(product.tier);
  const hasTier = tierQuantity !== null && product.tier !== null;
  // Only meaningful while there is still stock to run out of — a zero-stock
  // product renders the out-of-stock control instead, and "Only 0 left" would
  // be both wrong and alarming.
  const isLowStock =
    product.inStock &&
    product.stockQuantity > 0 &&
    product.stockQuantity <= product.lowStockThreshold;
  // #398 (derivation half), R34 — the derived unit price where a product HAS net content,
  // computed at render time (never from the stored sort-key column, R32); unitLabel unchanged
  // otherwise. `product.netContentAmount`/`netContentUnit` are both null or both set.
  const unitDisplay =
    product.netContentAmount !== null && product.netContentUnit !== null
      ? (deriveUnitPriceLabel(product.basePrice, {
          amount: product.netContentAmount,
          unit: product.netContentUnit,
        }) ?? product.unitLabel)
      : product.unitLabel;

  return (
    <div className="skew-card-wrap h-full">
      <Card variant="product">
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
          {/*
            #608 — filterable since #569, invisible until now: a shopper could narrow a listing to
            gluten-free products and read nothing on any card saying which ones were. Each badge
            carries its meaning as TEXT, not colour alone — `bg-surface-muted` here is decoration,
            and removing every colour from this card would leave all three still readable.

            HMC is a NAMED CERTIFYING BODY, not a synonym for Halal, and #239 was a real incident
            of this codebase asserting an HMC claim with nothing behind it. The badge is legitimate
            here because there is per-product data behind it (lib/catalogue-form.ts requires
            `hmcReference` whenever the flag is ticked), but the reference itself is rendered on
            the detail page rather than crammed onto a card.
          */}
          {product.isVegetarian && (
            <span className="skew-card-badge rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-primary shadow-sm">
              Vegetarian
            </span>
          )}
          {product.isGlutenFree && (
            <span className="skew-card-badge rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-primary shadow-sm">
              Gluten free
            </span>
          )}
          {product.isHmcCertified && (
            <span className="skew-card-badge rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-primary shadow-sm">
              HMC certified
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
              // #502: ProductImage is a thin client boundary that swaps to the
              // no-image box below if the object turns out not to exist in this
              // environment's bucket. Everything else about this card stays
              // server-rendered.
              <ProductImage
                src={composePublicUrl(cdnBaseUrl, product.primaryImage.storageKey)}
                alt={product.primaryImage.alt}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
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
              <ProductRating
                averageRating={product.averageRating}
                reviewCount={product.reviewCount}
              />
              {product.origin && (
                <span className="max-w-[100px] truncate text-[11px]" title={product.origin}>
                  {product.origin}
                </span>
              )}
            </div>

            {/* #608 — the brand, filterable since #569 and until now not shown anywhere. */}
            {product.brand && (
              <div
                className="mb-1 truncate text-[11px] font-medium text-black/60"
                title={product.brand.name}
              >
                {product.brand.name}
              </div>
            )}

            {/* Title — the card's one stretched link (R11/R12). `after:absolute
                after:inset-0` sizes against Card's `position: relative`, not
                this anchor's own box, so it covers the whole card while
                staying a plain single-element `<Link>`. */}
            <h3 className="line-clamp-2 text-sm leading-tight font-semibold text-black/90 transition-colors group-hover:text-primary">
              <Link
                href={`/products/${product.slug}`}
                className="after:absolute after:inset-0 after:content-['']"
              >
                {product.name}
              </Link>
            </h3>

            <p className="mt-0.5 text-xs text-black/60">{unitDisplay}</p>

            {isLowStock && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-danger">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Only {product.stockQuantity} left
              </p>
            )}
          </div>

          {/* Price & cart controls — a SIBLING of the title's stretched link,
              not a descendant of it (R11). `relative z-10` lifts this above
              the link's `after:inset-0` overlay so a click on the stepper or
              add-to-cart button registers instead of navigating. */}
          <div className="relative z-10 mt-3 flex flex-col gap-2 border-t border-black/5 pt-2">
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

            {hasTier && (
              <p className="skew-card-price -mt-1 text-[11px] font-semibold text-action">
                {tierQuantity} for {formatPrice(product.tier!.groupPricePence)}
              </p>
            )}

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
      </Card>
    </div>
  );
}
