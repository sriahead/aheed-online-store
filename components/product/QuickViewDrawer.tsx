"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Eye, Loader2, X } from "lucide-react";
import { useQuickView } from "./quick-view-context";
import { ProductImageGallery } from "./ProductImageGallery";
import { ProductRating } from "./ProductRating";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { formatPrice } from "./format-price";
import { deriveUnitPriceLabel, isNetContentUnit } from "./unit-price";
import { tierThresholdQuantity } from "@/lib/tier-pricing";
import { submitReview } from "@/features/reviews/submit-review";
import { deleteReview } from "@/features/reviews/delete-review";
import type { ProductDetail } from "@/lib/repositories/products";
import type { ReviewSummary, ReviewInput } from "@/lib/repositories/reviews";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface QuickViewApiResponse {
  product: ProductDetail;
  reviews: ReviewSummary[];
  existingReview: ReviewInput | null;
  currentUser: { id: string; name: string } | null;
  cdnBaseUrl: string;
}

export function QuickViewDrawer() {
  const { isOpen, activeSlug, initialProduct, closeQuickView } = useQuickView();
  const [data, setData] = useState<QuickViewApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const [reviewPending, startReviewTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const pathname = usePathname();

  // Remember opener element to restore focus on close
  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement as HTMLElement | null;
    }
  }, [isOpen]);

  // Close the drawer automatically when navigating to another page
  useEffect(() => {
    closeQuickView();
  }, [pathname, closeQuickView]);

  // Move focus into the drawer on open, and hand it back on close
  useEffect(() => {
    if (!isOpen) return;
    const opener = openerRef.current;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();
    return () => opener?.focus();
  }, [isOpen]);

  // Escape key and Tab focus trap
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeQuickView();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const insidePanel = active instanceof Node && panelRef.current?.contains(active);

      if (event.shiftKey && (active === first || !insidePanel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !insidePanel)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeQuickView]);

  // Fetch full product details and reviews asynchronously
  useEffect(() => {
    if (!isOpen || !activeSlug) {
      return;
    }

    let cancelled = false;
    fetch(`/api/products/quick-view?slug=${encodeURIComponent(activeSlug)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load product (${res.status})`);
        }
        return (await res.json()) as QuickViewApiResponse;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load product");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeSlug, refreshIndex]);

  if (!isOpen) {
    return null;
  }

  // Derived loading: product details are loading if current data is not yet for the activeSlug
  const loading = Boolean(activeSlug) && (!data || data.product.slug !== activeSlug);

  // Use full product data if loaded, otherwise fall back to initialProduct summary for instant UI
  const displayProduct = data?.product ?? initialProduct;
  const cdnBaseUrl = data?.cdnBaseUrl ?? "";
  const reviews = data?.reviews ?? [];
  const existingReview = data?.existingReview ?? null;
  const currentUser = data?.currentUser ?? null;

  const hasDiscount =
    displayProduct?.originalPrice != null &&
    displayProduct.originalPrice > (displayProduct?.basePrice ?? 0);
  const saving = hasDiscount ? displayProduct!.originalPrice! - displayProduct!.basePrice : 0;

  const unitDisplay = displayProduct
    ? displayProduct.netContentAmount !== null &&
      displayProduct.netContentUnit !== null &&
      isNetContentUnit(displayProduct.netContentUnit)
      ? (deriveUnitPriceLabel(displayProduct.basePrice, {
          amount: displayProduct.netContentAmount,
          unit: displayProduct.netContentUnit,
        }) ?? displayProduct.unitLabel)
      : displayProduct.unitLabel
    : "";

  const dietaryFacets = displayProduct
    ? [
        displayProduct.isHalal ? "Halal" : null,
        displayProduct.isFresh ? "Fresh" : null,
        displayProduct.isOrganic ? "Organic" : null,
        displayProduct.isVegetarian ? "Vegetarian" : null,
        displayProduct.isGlutenFree ? "Gluten free" : null,
        displayProduct.isHmcCertified ? "HMC certified" : null,
      ].filter((facet): facet is string => facet !== null)
    : [];

  const tierQuantity = tierThresholdQuantity(displayProduct?.tier ?? null);
  const hasTier = tierQuantity !== null && displayProduct?.tier != null;

  const description =
    data?.product?.description ??
    (displayProduct &&
    "description" in displayProduct &&
    typeof displayProduct.description === "string"
      ? displayProduct.description
      : undefined);
  const hmcReference =
    data?.product?.hmcReference ??
    (displayProduct &&
    "hmcReference" in displayProduct &&
    typeof displayProduct.hmcReference === "string"
      ? displayProduct.hmcReference
      : undefined);

  const isLowStock =
    displayProduct?.inStock &&
    displayProduct.stockQuantity > 0 &&
    displayProduct.stockQuantity <= displayProduct.lowStockThreshold;

  const displayImages =
    data?.product?.images ?? (initialProduct?.primaryImage ? [initialProduct.primaryImage] : []);

  const handleReviewSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!displayProduct) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    setReviewError(null);

    startReviewTransition(async () => {
      try {
        await submitReview(formData);
        setRefreshIndex((i) => i + 1);
      } catch (err) {
        setReviewError(err instanceof Error ? err.message : "Failed to submit review");
      }
    });
  };

  const handleReviewDelete = (reviewId: string) => {
    if (!displayProduct) return;
    setDeletingId(reviewId);
    setReviewError(null);

    startReviewTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("reviewId", reviewId);
        formData.append("productSlug", displayProduct.slug);
        await deleteReview(formData);
        setRefreshIndex((i) => i + 1);
      } catch (err) {
        setReviewError(err instanceof Error ? err.message : "Failed to delete review");
      } finally {
        setDeletingId(null);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={closeQuickView}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-10">
        <div
          ref={panelRef}
          className="flex w-screen max-w-lg flex-col border-l border-black/10 bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-primary p-4 text-white">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5" aria-hidden />
              <h2 id={titleId} className="text-base font-bold">
                Quick View
              </h2>
            </div>
            <button
              type="button"
              onClick={closeQuickView}
              aria-label="Close Quick View"
              className="rounded-full p-1.5 text-white transition-colors hover:bg-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-6">
            {loading && !displayProduct && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-primary-muted">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
                <p className="text-sm font-medium">Loading product details...</p>
              </div>
            )}

            {error && !displayProduct && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
                <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />
                <p className="text-sm font-medium text-danger">{error}</p>
                <button
                  type="button"
                  onClick={() => setRefreshIndex((i) => i + 1)}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white transition hover:bg-primary/90"
                >
                  Try again
                </button>
              </div>
            )}

            {displayProduct && (
              <div className="flex flex-col gap-6">
                {/* Images */}
                <div className="overflow-hidden rounded-2xl bg-surface-muted">
                  <ProductImageGallery
                    images={displayImages}
                    cdnBaseUrl={cdnBaseUrl}
                    variant="carousel"
                  />
                </div>

                {/* Product Title & Basic Info */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ProductRating
                      averageRating={displayProduct.averageRating}
                      reviewCount={displayProduct.reviewCount}
                    />
                    {displayProduct.origin && (
                      <span className="text-xs font-medium text-black/60">
                        {displayProduct.origin}
                      </span>
                    )}
                  </div>

                  {displayProduct.brand && (
                    <span className="text-xs font-semibold text-black/60">
                      {displayProduct.brand.name}
                    </span>
                  )}

                  <h3 className="text-xl sm:text-2xl font-bold text-primary">
                    {displayProduct.name}
                  </h3>

                  {/* Price & Discount */}
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-primary">
                      {formatPrice(displayProduct.basePrice)}
                    </span>
                    {hasDiscount && (
                      <span className="text-sm text-black/60 line-through">
                        {formatPrice(displayProduct.originalPrice!)}
                      </span>
                    )}
                    {hasDiscount && (
                      <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">
                        Save {formatPrice(saving)}
                      </span>
                    )}
                  </div>

                  {hasTier && (
                    <p className="text-xs font-semibold text-action">
                      {tierQuantity} for {formatPrice(displayProduct.tier!.groupPricePence)}
                    </p>
                  )}

                  <p className="text-xs text-primary-muted">{unitDisplay}</p>

                  {/* Stock Availability */}
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        displayProduct.inStock ? "text-action" : "text-danger"
                      }`}
                    >
                      {displayProduct.inStock ? "In stock" : "Out of stock"}
                    </span>
                    {isLowStock && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-danger">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        Only {displayProduct.stockQuantity} left
                      </span>
                    )}
                  </div>
                </div>

                {/* Dietary Badges & Attributes */}
                {(dietaryFacets.length > 0 || displayProduct.origin || displayProduct.brand) && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Product attributes">
                    {dietaryFacets.map((facet) => (
                      <li
                        key={facet}
                        className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {facet}
                      </li>
                    ))}
                    {displayProduct.brand && (
                      <li className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-primary">
                        {displayProduct.brand.name}
                      </li>
                    )}
                    {displayProduct.origin && (
                      <li className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-primary">
                        {displayProduct.origin}
                      </li>
                    )}
                  </ul>
                )}

                {/* HMC Certification Reference */}
                {displayProduct.isHmcCertified && hmcReference && (
                  <p className="text-xs text-primary-muted">
                    HMC certification reference: {hmcReference}
                  </p>
                )}

                {/* Description */}
                {description && (
                  <div className="border-t border-black/10 pt-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary-muted mb-1">
                      Description
                    </h4>
                    <p className="text-sm leading-relaxed text-primary-muted">{description}</p>
                  </div>
                )}

                {/* Quantity Selector & Add to Cart */}
                <div className="border-t border-black/10 pt-4">
                  <AddToCartButton
                    productId={displayProduct.id}
                    disabled={!displayProduct.inStock}
                    variant="drawer"
                    label={`Add ${displayProduct.name} to cart`}
                  />
                </div>

                {/* Reviews & Ratings Section */}
                <div className="border-t border-black/10 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold text-primary">Reviews & Ratings</h4>
                    <span className="text-xs font-medium text-primary-muted">
                      {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
                    </span>
                  </div>

                  {reviewError && (
                    <div className="mb-4 rounded-xl border border-danger/20 bg-danger/10 p-3 text-xs font-medium text-danger">
                      {reviewError}
                    </div>
                  )}

                  {/* Review Form (for logged-in shoppers) or Log in link */}
                  {currentUser ? (
                    <form
                      key={
                        existingReview
                          ? `${existingReview.rating}:${existingReview.comment ?? ""}`
                          : "new"
                      }
                      onSubmit={handleReviewSubmit}
                      className="mb-6 flex flex-col gap-3 rounded-2xl border border-black/10 bg-surface-muted/40 p-4"
                    >
                      <input type="hidden" name="productId" value={displayProduct.id} />
                      <input type="hidden" name="productSlug" value={displayProduct.slug} />

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-primary">
                          {existingReview ? "Update your review" : "Leave a review"}
                        </span>
                        {existingReview && (
                          <span className="text-[11px] text-action font-semibold">
                            You previously reviewed this
                          </span>
                        )}
                      </div>

                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-primary">Your rating</span>
                        <select
                          name="rating"
                          required
                          defaultValue={existingReview?.rating ?? ""}
                          className="w-28 rounded-lg border border-black/20 bg-white px-3 py-2 text-sm text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                        >
                          <option value="" disabled>
                            Select rating
                          </option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n} {n === 1 ? "star" : "stars"}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-primary">
                          Comment (optional)
                        </span>
                        <textarea
                          name="comment"
                          defaultValue={existingReview?.comment ?? ""}
                          rows={3}
                          placeholder="Share your thoughts about this product..."
                          className="rounded-lg border border-black/20 bg-white px-3 py-2 text-sm text-primary placeholder:text-primary-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={reviewPending}
                        className="self-start rounded-xl bg-action px-4 py-2 text-xs font-bold text-white transition hover:bg-action-hover active:scale-95 motion-reduce:active:scale-100 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                      >
                        {reviewPending && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        )}
                        <span>{existingReview ? "Update review" : "Submit review"}</span>
                      </button>
                    </form>
                  ) : (
                    <div className="mb-6 rounded-2xl border border-black/10 bg-surface-muted/40 p-4 text-center">
                      <p className="text-sm text-primary-muted">
                        <Link
                          href="/login"
                          className="font-bold text-action hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-xs"
                        >
                          Log in
                        </Link>{" "}
                        to leave a review.
                      </p>
                    </div>
                  )}

                  {/* Reviews List */}
                  <div className="flex flex-col gap-3">
                    {reviews.length === 0 ? (
                      <p className="py-4 text-center text-sm text-primary-muted">
                        No reviews yet. Be the first to review this product!
                      </p>
                    ) : (
                      reviews.map((review) => (
                        <div
                          key={review.id}
                          className="flex flex-col gap-1.5 rounded-2xl border border-black/10 bg-white p-3.5 shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-primary">
                              {review.reviewerName} — {review.rating}/5
                            </span>
                            {currentUser && review.userId === currentUser.id && (
                              <button
                                type="button"
                                onClick={() => handleReviewDelete(review.id)}
                                disabled={deletingId === review.id || reviewPending}
                                className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                              >
                                {deletingId === review.id ? "Deleting..." : "Delete"}
                              </button>
                            )}
                          </div>
                          {review.comment && (
                            <p className="text-xs leading-relaxed text-primary-muted">
                              {review.comment}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
