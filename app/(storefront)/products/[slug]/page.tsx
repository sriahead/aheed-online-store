import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductRepository } from "@/lib/products-service";
import { getReviewRepository } from "@/lib/reviews-service";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/config";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { buildProductMetadata } from "@/lib/page-metadata";
import { formatPrice } from "@/components/product/format-price";
import { deriveUnitPriceLabel } from "@/components/product/unit-price";
import { ProductImageGallery } from "@/components/product/ProductImageGallery";
import { ProductRating } from "@/components/product/ProductRating";
import { tierThresholdQuantity } from "@/lib/tier-pricing";
import { showsLowStock } from "@/lib/cart-rules";
import { PageContainer } from "@/components/layout/PageContainer";
import { RestockNotice } from "@/components/product/RestockNotice";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { ReviewForm } from "@/features/reviews/components/ReviewForm";
import { deleteReview } from "@/features/reviews/delete-review";
import { Icon } from "@/components/icons/Icon";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

const REVIEWS_SHOWN = 20;

/**
 * #996 — this route's own title, description and canonical.
 *
 * Without it the page inherited `app/layout.tsx`'s vendor-level metadata, so every product on a
 * vendor shared one `<title>`. The two reads here are request-memoised (`getCurrentVendorProfile`
 * via React `cache()`, and the repository's own per-instance memoisation), so this costs the page
 * no extra round-trip beyond what its body already issues.
 *
 * RETURNS `{}` RATHER THAN NAMING A VENDOR when anything cannot be read. `app/layout.tsx`'s
 * metadata then stands, which is the same degradation it already performs for a DB hiccup — a
 * database blip must not turn a product page from 200 into 500. It deliberately does NOT use the
 * `profile?.name ?? "Aheed Food Centre"` fallback that `app/(storefront)/categories/page.tsx`
 * uses: a host with no vendor is redirected to `/coming-soon`, so the fallback would never be read
 * by a shopper, and naming one vendor on another's host is the defect this slice is removing
 * elsewhere.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const host = (await headers()).get("host");
    const [product, profile] = await Promise.all([
      getProductRepository().getBySlug(slug),
      getCurrentVendorProfile(),
    ]);
    if (!host || !product || !profile) return {};

    return buildProductMetadata({
      host,
      slug,
      name: product.name,
      description: product.description,
      vendorName: profile.name,
    });
  } catch {
    return {};
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductRepository().getBySlug(slug);
  if (!product) {
    notFound();
  }

  // #398 (derivation half), R34 — the derived unit price where the product HAS net content,
  // computed at render time (never from the stored sort-key column, R32); unitLabel unchanged
  // otherwise. Same fallback shape as components/product/ProductCard.tsx.
  const unitDisplay =
    product.netContentAmount !== null && product.netContentUnit !== null
      ? (deriveUnitPriceLabel(product.basePrice, {
          amount: product.netContentAmount,
          unit: product.netContentUnit,
        }) ?? product.unitLabel)
      : product.unitLabel;

  // #608 — only the flags that are actually TRUE, in a fixed reading order. Same labels the
  // filter chips use (components/product/filter-chips.ts), so a shopper who filtered by
  // "Gluten free" sees that exact wording again on the product they opened.
  const dietaryFacets = [
    product.isHalal ? "Halal" : null,
    product.isFresh ? "Fresh" : null,
    product.isOrganic ? "Organic" : null,
    product.isVegetarian ? "Vegetarian" : null,
    product.isGlutenFree ? "Gluten free" : null,
    product.isHmcCertified ? "HMC certified" : null,
  ].filter((facet): facet is string => facet !== null);

  const { CDN_BASE_URL } = getEnv();
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const reviewRepo = getReviewRepository();

  const [reviews, existingReview] = await Promise.all([
    reviewRepo.listByProduct(product.id, REVIEWS_SHOWN),
    session?.user
      ? reviewRepo.getByUserAndProduct(session.user.id, product.id)
      : Promise.resolve(null),
  ]);

  const isInStock = Boolean(
    product.inStock ||
    (product.stockQuantity !== undefined && product.stockQuantity > 0) ||
    product.stockMode === "UNTRACKED",
  );
  const isLowStock = isInStock && showsLowStock(product);
  const hasDiscount = product.originalPrice != null && product.originalPrice > product.basePrice;
  const saving = hasDiscount ? product.originalPrice! - product.basePrice : 0;
  const tierQuantity = tierThresholdQuantity(product.tier);
  const hasTier = tierQuantity !== null && product.tier !== null;

  return (
    <PageContainer width="standard">
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="relative">
          <ProductImageGallery images={product.images} cdnBaseUrl={CDN_BASE_URL ?? ""} />
          {hasDiscount && (
            <div className="absolute top-3 left-3 z-10 rounded-full bg-danger px-2.5 py-1 text-xs font-bold text-white shadow-sm">
              Save {formatPrice(saving)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/* Brand & Reviews */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {product.brand ? (
              <span className="font-bold uppercase tracking-wider text-primary-muted">
                {product.brand.name}
              </span>
            ) : (
              <span />
            )}
            <ProductRating
              averageRating={product.averageRating}
              reviewCount={product.reviewCount}
            />
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary leading-tight">
            {product.name}
          </h1>

          {/* Pricing Row with Anchoring */}
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-extrabold text-primary">
              {formatPrice(product.basePrice)}
            </span>
            {hasDiscount && (
              <span className="text-base text-black/60 line-through">
                {formatPrice(product.originalPrice!)}
              </span>
            )}
            {hasDiscount && (
              <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-bold text-danger">
                Save {formatPrice(saving)}
              </span>
            )}
          </div>

          {/* Unit Price */}
          <p className="text-xs text-primary-muted font-medium">{unitDisplay}</p>

          {/* Tier Pricing */}
          {hasTier && (
            <div className="rounded-xl bg-action-tint/60 border border-action/20 p-2.5 text-xs font-bold text-action">
              Multi-buy offer: {tierQuantity} for {formatPrice(product.tier!.groupPricePence)}
            </div>
          )}

          {/* Stock Status & Scarcity */}
          <div className="flex items-center gap-2.5 py-1">
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-bold ${
                isInStock ? "text-emerald-700" : "text-danger"
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${isInStock ? "bg-emerald-500" : "bg-danger"}`}
              />
              {isInStock ? "In stock — ready for collection / delivery" : "Out of stock"}
            </span>
            {isLowStock && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-900 px-2 py-0.5 text-xs font-bold">
                <Icon name="triangle-alert" className="h-3.5 w-3.5 text-amber-700" />
                Only {product.stockQuantity} left
              </span>
            )}
          </div>
          {!isInStock && product.expectedRestockDay !== null && (
            <RestockNotice
              day={product.expectedRestockDay}
              className="text-sm font-medium"
              iconClassName="h-4 w-4"
            />
          )}

          {/* Dietary Facets & Attributes */}
          {(dietaryFacets.length > 0 || product.brand || product.origin) && (
            <ul className="flex flex-wrap gap-2 pt-1" aria-label="Product attributes">
              {dietaryFacets.map((facet) => (
                <li
                  key={facet}
                  className="rounded-full bg-surface-muted border border-black/5 px-3 py-1 text-xs font-semibold text-primary"
                >
                  {facet}
                </li>
              ))}
              {product.origin && (
                <li className="rounded-full bg-surface-muted border border-black/5 px-3 py-1 text-xs font-semibold text-primary">
                  Origin: {product.origin}
                </li>
              )}
            </ul>
          )}

          {/* Add to Cart CTA */}
          <div className="pt-2">
            <AddToCartButton
              productId={product.id}
              productName={product.name}
              disabled={!isInStock}
              variant="full"
              acceptsNote={product.acceptsNote}
            />
          </div>

          {/* Trust Guarantees & Reassurance (Neuromarketing / Credibility) */}
          <div className="mt-2 rounded-2xl border border-black/10 bg-surface-muted/30 p-4 divide-y divide-black/5">
            <div className="flex items-center gap-3 pb-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon name="shield-check" className="h-4 w-4" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-primary">Quality & Freshness Guarantee</p>
                <p className="text-primary-muted">Hand-selected daily by store specialists.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-action/10 text-action">
                <Icon name="truck" className="h-4 w-4" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-primary">Flexible Store Pickup & Local Delivery</p>
                <p className="text-primary-muted">
                  Choose your convenient collection or delivery slot at checkout.
                </p>
              </div>
            </div>
            {product.isHalal && (
              <div className="flex items-center gap-3 pt-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                  <Icon name="circle-check" className="h-4 w-4" />
                </div>
                <div className="text-xs">
                  <p className="font-bold text-primary">100% Halal Verified</p>
                  <p className="text-primary-muted">Certified halal supply chain and handling.</p>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div className="pt-2 border-t border-black/10">
              <h2 className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1.5">
                Product Details
              </h2>
              <p className="text-sm leading-relaxed text-black/80">{product.description}</p>
            </div>
          )}

          {/* Specifications */}
          {product.specifications.length > 0 && (
            <section
              aria-labelledby="specifications-heading"
              className="pt-2 border-t border-black/10"
            >
              <h2
                id="specifications-heading"
                className="text-xs font-bold uppercase tracking-wider text-black/60 mb-2"
              >
                Specifications
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                {product.specifications.map((spec) => (
                  <div key={spec.name} className="contents">
                    <dt className="text-primary-muted font-medium">{spec.name}</dt>
                    <dd className="text-primary font-semibold">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {product.isHmcCertified && product.hmcReference && (
            <p className="text-xs text-primary-muted italic">
              HMC certification reference: {product.hmcReference}
            </p>
          )}
        </div>

        {/* #981 — `product-reviews` is the measuring hook. The product page carries the same
      under-44px review controls as Quick View (it renders the same `ReviewForm` and the same
      `StarRatingInput`), and `scripts/verify-mobile-layout.ts` reports a control only when it
      sits inside a `data-tap-surface`. */}
        <section data-tap-surface="product-reviews" className="col-span-full flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-primary">Reviews</h2>

          {session?.user ? (
            <ReviewForm productId={product.id} productSlug={slug} existingReview={existingReview} />
          ) : (
            <p className="text-primary-muted">
              <Link
                href="/login"
                className="inline-flex min-h-tap min-w-tap items-center justify-center font-semibold text-action lg:min-h-0 lg:min-w-0"
              >
                Log in
              </Link>{" "}
              to leave a review.
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-2xl border border-black/10 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary">
                    {review.reviewerName} — {review.rating}/5
                  </span>
                  {session?.user && review.userId === session.user.id && (
                    <form action={deleteReview}>
                      <input type="hidden" name="reviewId" value={review.id} />
                      <input type="hidden" name="productSlug" value={slug} />
                      <button
                        type="submit"
                        className="flex min-h-tap min-w-tap items-center justify-center text-sm text-danger lg:min-h-0 lg:min-w-0"
                      >
                        Delete
                      </button>
                    </form>
                  )}
                </div>
                {review.comment && <p className="text-primary-muted">{review.comment}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageContainer>
  );
}
