# P841 — Clickable Star Ratings for Product Reviews (requirements / acceptance criteria)

This slice replaces the traditional `<select>` dropdown for product ratings with an accessible, interactive 5-star rating control across both the Quick View drawer and the dedicated product details page.

R1. The rating `<select>` dropdown in `components/product/QuickViewDrawer.tsx` is removed.

R2. The rating `<select>` dropdown in `features/reviews/components/ReviewForm.tsx` is removed.

R3. A new component `components/product/StarRatingInput.tsx` is created, providing clickable star selection (1–5).

R4. Hovering over any star illuminates stars 1 through the hovered star with full amber fill/text, reverting to the selected rating upon mouse leave.

R5. Clicking a star immediately sets or updates the selected rating (1–5) and updates the dynamic rating indicator label (e.g. "Select rating", "Poor", "Fair", "Good", "Very Good", "Excellent").

R6. The control is backed by an accessible `<fieldset>` with `<legend>` and hidden radio inputs, supporting keyboard navigation (Arrow keys / Tab), screen reader labels, and standard form data serialization (`formData.get("rating")`).

R7. The component supports `defaultValue` to pre-fill an existing review's rating when editing a previously submitted review.

R8. When the review form in the Quick View drawer is submitted without selecting a rating, client-side validation prevents submission and presents a clear error message.

R9. Hover and active scaling effects include `motion-reduce:hover:scale-100 motion-reduce:active:scale-100` to respect reduced motion settings.

R10. `CHANGELOG.md` updated with an entry for `#841` under `## [Unreleased]` (Gate 4).

R11. `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run` all exit 0 with zero errors (Gate 3).
