import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductRepository } from "@/lib/repositories/products";
import { getReviewRepository } from "@/lib/repositories/reviews";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/config";
import { formatPrice } from "@/components/product/format-price";
import { ProductImageGallery } from "@/components/product/ProductImageGallery";
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

  const { CDN_BASE_URL } = getEnv();
  const session = await getAuth().api.getSession({ headers: await headers() });
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
        <p className="text-primary/80">{product.description}</p>
        <p className="text-sm text-primary/70">{product.unitLabel}</p>
        <p className="text-xl font-semibold text-action">{formatPrice(product.basePrice)}</p>
        <p className={product.inStock ? "text-action" : "text-danger"}>
          {product.inStock ? "In stock" : "Out of stock"}
        </p>
      </div>

      <section className="col-span-full flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-primary">Reviews</h2>

        {session?.user ? (
          <ReviewForm productId={product.id} productSlug={slug} existingReview={existingReview} />
        ) : (
          <p className="text-primary/70">
            <Link href="/login" className="font-semibold text-action">
              Log in
            </Link>{" "}
            to leave a review.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-md border border-black/10 p-3">
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
              {review.comment && <p className="text-primary/80">{review.comment}</p>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
