import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductRepository } from "@/lib/products-service";
import { getReviewRepository } from "@/lib/reviews-service";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/config";
import { formatPrice } from "@/components/product/format-price";
import { deriveUnitPriceLabel } from "@/components/product/unit-price";
import { ProductImageGallery } from "@/components/product/ProductImageGallery";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { ReviewForm } from "@/features/reviews/components/ReviewForm";
import { deleteReview } from "@/features/reviews/delete-review";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

const REVIEWS_SHOWN = 20;

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

  return (
    <main className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
      <ProductImageGallery images={product.images} cdnBaseUrl={CDN_BASE_URL ?? ""} />
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-primary">{product.name}</h1>
        <p className="text-primary-muted">{product.description}</p>
        <p className="text-sm text-primary-muted">{unitDisplay}</p>
        <p className="text-xl font-semibold text-action">{formatPrice(product.basePrice)}</p>
        <p className={product.inStock ? "text-action" : "text-danger"}>
          {product.inStock ? "In stock" : "Out of stock"}
        </p>

        {/*
          #608 — this page rendered NO facet at all before now, not even Halal or Fresh, which the
          product CARD has shown since P2.5b1. So the detail page was the larger of the two gaps
          that issue names: a shopper who filtered a listing by a facet and then opened a product
          lost every trace of why it matched.

          Each entry is text, never colour alone. `dietaryFacets` is built from the product's own
          booleans so a false flag renders nothing rather than a greyed-out chip claiming an
          absence the data does not actually assert (a product is not marked "not vegetarian";
          it is simply not marked).
        */}
        {(dietaryFacets.length > 0 || product.brand || product.origin) && (
          <ul className="flex flex-wrap gap-2" aria-label="Product attributes">
            {dietaryFacets.map((facet) => (
              <li
                key={facet}
                className="rounded-full bg-surface-muted px-3 py-1 text-sm font-medium text-primary"
              >
                {facet}
              </li>
            ))}
            {product.brand && (
              <li className="rounded-full bg-surface-muted px-3 py-1 text-sm font-medium text-primary">
                {product.brand.name}
              </li>
            )}
            {product.origin && (
              <li className="rounded-full bg-surface-muted px-3 py-1 text-sm font-medium text-primary">
                {product.origin}
              </li>
            )}
          </ul>
        )}

        {/*
          #239/#608 — the HMC reference travels WITH the claim, never behind it. #239 was a real
          incident of this codebase asserting "100% Certified HMC Halal" for a vendor with no basis
          for it; `lib/catalogue-form.ts` now requires this reference whenever the flag is ticked,
          and rendering it here is what makes the badge above an attributable claim rather than a
          decoration.
        */}
        {product.isHmcCertified && product.hmcReference && (
          <p className="text-sm text-primary-muted">
            HMC certification reference: {product.hmcReference}
          </p>
        )}
        {/* Real add-to-cart (P3a) — full-width variant, no wrapping <Link> here. */}
        <AddToCartButton productId={product.id} disabled={!product.inStock} variant="full" />
      </div>

      <section className="col-span-full flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-primary">Reviews</h2>

        {session?.user ? (
          <ReviewForm productId={product.id} productSlug={slug} existingReview={existingReview} />
        ) : (
          <p className="text-primary-muted">
            <Link href="/login" className="font-semibold text-action">
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
                    <button type="submit" className="text-sm text-danger">
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
    </main>
  );
}
