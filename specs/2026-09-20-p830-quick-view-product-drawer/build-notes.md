# P830 — Quick View Product Drawer (build notes)

Written at the end of Build, before the Clear.

## What changed and why

1. **`components/product/quick-view-context.tsx`**:
   - Created `QuickViewContext` and `QuickViewProvider` to manage global drawer state: `isOpen`, `activeSlug`, and optional `initialProduct`.
   - Exported `useQuickView()` with a no-op fallback when called outside the provider, preventing crashes if rendered in isolated contexts.

2. **`components/product/QuickViewDrawer.tsx`**:
   - Implemented a right-side sliding drawer with backdrop blur, focus trapping, Escape dismiss, and body scroll lock.
   - Built an interactive multi-image gallery with thumbnail selection and preview.
   - Included full product details: name, brand, badge, star rating summary, review count, price with sale strikethrough, unit price calculation, stock availability, low stock warning, net content, origin, and markdown description.
   - Incorporated `AddToCartButton` with `variant="drawer"` offering an accessible quantity stepper and add button.
   - Implemented full review lifecycle: display approved reviews with verified badges, review form for authenticated users (create, edit, delete), and immediate local state refresh without page reload.
   - Omitted any "View full details" drill-down link to keep the shopper's flow within the drawer.

3. **`app/api/products/quick-view/route.ts`**:
   - Added GET endpoint returning product details, reviews, existing user review, and CDN URL.
   - Structured error handling returning 400 for missing slug and 404 for unknown product.

4. **`components/product/ProductCard.tsx`**:
   - Converted to client component and removed the outer stretched link to `/products/[slug]`.
   - Added desktop hover overlay button (`group-hover:opacity-100 duration-300`) and mobile compact button (`sm:hidden`).
   - Wired product title button to open Quick View.
   - Preserved direct card Add to Cart button without nesting buttons.

5. **`components/cart/AddToCartButton.tsx`**:
   - Added `variant="drawer"` for prominent quantity stepper and Add to Cart action inside the Quick View drawer.

6. **`components/layout/StorefrontChrome.tsx`**:
   - Wrapped storefront layout in `QuickViewProvider` and rendered `QuickViewDrawer` inside `brandStyle()` container.

7. **Tests & Gate Verification**:
   - Updated `tests/product-card-stretched-link.test.tsx` to assert no `/products/` link, no nested buttons, and presence of desktop/mobile Quick View triggers.
   - Added `tests/quick-view.test.tsx` for drawer rendering, reviews, form, and accessibility.
   - Added `tests/quick-view-route.test.ts` for API route response codes and payload structure.

## Decisions taken during the build

- **Derived Loading State**: Derived loading state from `Boolean(activeSlug) && (!data || data.product.slug !== activeSlug)` instead of setting state synchronously inside `useEffect`, avoiding React 19 warnings.
- **Unit Price Safety**: Guarded `isNetContentUnit(displayProduct.netContentUnit)` before invoking `deriveUnitPriceLabel` to satisfy strict typing.
- **Motion-Reduce Coverage**: Added `motion-reduce:hover:scale-100 motion-reduce:active:scale-100` on animated buttons to strictly comply with `tests/motion-reduce-coverage.test.ts`.
- **Token Purity**: Avoided themed foreground alpha (`text-primary/70`) and used `text-primary-muted` to satisfy design token guidelines.

## Deviations from the spec

None.

## Known-shaky areas

None. All 153 test files and 2,073 tests pass, `eslint`, `tsc`, and Next.js webpack build all succeed cleanly.
