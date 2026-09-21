# P847 — Website Feedback Clickable Star Rating (build notes)

Written at the end of Build, before the Clear.

## What changed and why

- `components/storefront/FeedbackForm.tsx`:
  - Replaced the radio-button pill `<fieldset>` with `<StarRatingInput name="rating" defaultValue={existing?.rating ?? null} label="Your rating" labelClassName="text-sm font-semibold text-primary" required />`.
  - Added `key={existing?.rating ?? "new"}` to ensure remounting if the existing rating prop changes upon revalidation.
  - Reused `StarRatingInput` directly from `@/components/product/StarRatingInput` ensuring identical hover effects, fill transitions, accessibility semantics, and rating labels ("Poor", "Fair", "Good", "Very Good", "Excellent").
  - Preserved all other feedback form logic, comments, character limit, and submit action wiring.
- `tests/feedback-form.test.tsx`:
  - Added 5 unit tests for `FeedbackForm` verifying default rendering with unselected stars, pre-filled rendering with `existing.rating`, user click rating updates, hover previews with mouse-leave restoration, and form serialization with selected rating in `FormData`.
- `CHANGELOG.md`:
  - Added entry for `#847` under `## [Unreleased]` -> `### Changed`.

## Decisions taken during the build

- Reused `@/components/product/StarRatingInput` without relocation or duplicate exports to avoid unnecessary churn across other consumers (`QuickViewDrawer.tsx`, `ReviewForm.tsx`).
- Kept `label="Your rating"` and `labelClassName="text-sm font-semibold text-primary"` to match both Product Reviews and the previous Website Feedback form label styling.

## Deviations from the spec

None.

## Known-shaky areas

None. All 5 tests in `tests/feedback-form.test.tsx` and all 33 tests across related test suites (`tests/validate-feedback.test.ts`, `tests/review-form.test.tsx`, `tests/star-rating-input.test.tsx`) pass cleanly.
