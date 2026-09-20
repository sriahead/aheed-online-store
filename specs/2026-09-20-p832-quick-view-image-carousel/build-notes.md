# P832 — Quick View Product Image Carousel (build notes)

Written at the end of Build, before the Clear.

## What changed and why

1. **`components/product/ProductImageGallery.tsx`**:
   - Converted to client component supporting `variant?: "stacked" | "carousel"` (defaulting to `"stacked"` for the product detail page).
   - In `"carousel"` mode, renders a single main product image at a time within an `aspect-square w-full` bounding container.
   - Built smooth horizontal slide transitions via CSS `translateX(-${currentIndex * 100}%)` with `duration-300 ease-out` and `motion-reduce:transition-none`.
   - Added accessible Left and Right arrow buttons (`ChevronLeft`, `ChevronRight`) overlaying the image when `images.length > 1`.
   - Added touch swipe detection (`onTouchStart`, `onTouchEnd`) with horizontal threshold filtering.
   - Added pagination pill container with clickable dots and tabular `"X / total"` counter.
   - Added keyboard navigation support (`ArrowLeft`, `ArrowRight`).
   - Hides navigation arrows and indicators when there is only one image.

2. **`components/product/QuickViewDrawer.tsx`**:
   - Passed `variant="carousel"` to `ProductImageGallery` so that multiple product images never stack vertically in the drawer.
   - Keeps the Quick View drawer compact and immediately focused on product details, quantity selection, Add to Cart, and reviews.

3. **`tests/quick-view-image-carousel.test.tsx` and `tests/quick-view.test.tsx`**:
   - Added comprehensive tests verifying single image rendering, multi-image carousel, arrow clicks, touch swipe, keyboard navigation, and pagination indicators.

## Decisions taken during the build

- **Variant support**: Maintained `variant="stacked"` as default for `ProductImageGallery` to ensure `app/(storefront)/products/[slug]/page.tsx` remains completely unaffected.
- **Horizontal Translate**: Used `translateX(-${currentIndex * 100}%)` across `w-full shrink-0 aspect-square` slide wrappers, guaranteeing zero layout shift or vertical jitter when transitioning.
- **Motion Reduction**: Added `motion-reduce:transition-none` and `motion-reduce:hover:scale-100` to satisfy strict motion reduction coverage.

## Deviations from the spec

None.

## Known-shaky areas

None. All tests pass, lint and typecheck are clean.
