# P841 — Clickable Star Ratings for Product Reviews (build notes)

Written at the end of Build, before the Clear.

## What changed and why

1. **`components/product/StarRatingInput.tsx`**:
   - Created an accessible, interactive star rating component replacing `<select name="rating">` dropdowns.
   - Built on semantic `<fieldset>` and `<input type="radio">` to ensure full screen reader support, keyboard navigation (Arrow keys/Tab), and native form data serialization (`formData.get("rating")`).
   - Features hover preview showing amber fill on stars 1 through hovered star, reverting to selected rating on mouse leave.
   - Includes live text feedback ("Select rating", "1 star", "5 stars") with `aria-live="polite"`.
   - Adheres to `tests/motion-reduce-coverage.test.ts` and `tests/radius-scale.test.ts` with `motion-reduce:hover:scale-100 motion-reduce:active:scale-100` and canonical `rounded` utilities.

2. **`components/product/QuickViewDrawer.tsx`**:
   - Replaced `<select name="rating">` with `StarRatingInput`.
   - Added validation check in `handleReviewSubmit` to guard against submitting without a selected rating.

3. **`features/reviews/components/ReviewForm.tsx`**:
   - Replaced `<select name="rating">` with `StarRatingInput` for site-wide consistency on `/products/[slug]`.

4. **Automated Tests**:
   - Added `tests/star-rating-input.test.tsx` testing rendering, click-to-rate, hover preview, `defaultValue`, disabled state, and form submission.
   - Added `tests/review-form.test.tsx` verifying ReviewForm integration.
   - Updated `tests/quick-view.test.tsx` with star rating interaction verification.

## Decisions taken during the build

- **Semantic `<fieldset>` over `<div role="radiogroup">`**: Using a semantic `<fieldset>` with `<legend>` completely satisfies `jsx-a11y/interactive-supports-focus` while offering native grouping semantics for screen readers.
- **Overlay Radio Inputs (`absolute inset-0 opacity-0`)**: Positioning the `<input type="radio">` over the entire star bounding box allows native browser focus outlines, click handling, and HTML5 validation without tripping Chromium's "invalid form control is not focusable" console error.
- **Motion Reduction & Token Compliance**: Used `text-primary-subtle` for unfilled stars and `fill-amber-400 text-amber-400` for filled stars, adhering strictly to design token purity and motion-reduction guardrails.

## Deviations from the spec

None. All criteria in `requirements.md` are satisfied.

## Known-shaky areas

None. All 81 relevant unit and guardrail tests pass with 0 errors.
