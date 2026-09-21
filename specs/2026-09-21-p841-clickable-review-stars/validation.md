# P841 — Clickable Star Ratings for Product Reviews (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests.
> - **Build:** Verify the component, accessibility, radio backing, and styling rules.
> - **Validate:** Verify interactive star selection, hover preview, pre-filling, and form submission.
> - **Release:** Confirm absence of select dropdowns, zero lint/typecheck errors, and green test suite.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Inspection   | Check `components/product/QuickViewDrawer.tsx` has no `<select name="rating">`. |
| R2  | Inspection   | Check `features/reviews/components/ReviewForm.tsx` has no `<select name="rating">`. |
| R3  | Unit         | Run `npx vitest run tests/star-rating-input.test.tsx` verifying 5 clickable star options. |
| R4  | Unit         | Run `npx vitest run tests/star-rating-input.test.tsx` verifying hover preview and mouse leave revert. |
| R5  | Unit         | Run `npx vitest run tests/star-rating-input.test.tsx` verifying rating updates on click. |
| R6  | Unit         | Run `npx vitest run tests/star-rating-input.test.tsx` verifying radio inputs within semantic fieldset. |
| R7  | Unit         | Run `npx vitest run tests/star-rating-input.test.tsx` verifying `defaultValue` pre-filling. |
| R8  | Unit         | Run `npx vitest run tests/quick-view.test.tsx` verifying rating validation on submission. |
| R9  | Quality      | Run `npx vitest run tests/motion-reduce-coverage.test.ts` verifying reduced-motion coverage. |
| R10 | Process      | Verify `CHANGELOG.md` contains an entry for `#841` under `## [Unreleased]`. |
| R11 | Gate 3       | Run `npm run lint && npm run typecheck && npm run format:check && npx vitest run` and confirm all exit 0. |
