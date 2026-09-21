# P847 — Website Feedback Clickable Star Rating (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Code / Unit  | `components/storefront/FeedbackForm.tsx` imports `StarRatingInput` from `@/components/product/StarRatingInput` and contains no radio button pill labels (`star` / `stars`). |
| R2  | Code / Unit  | In `FeedbackForm.tsx`, `<StarRatingInput name="rating" defaultValue={existing?.rating ?? null} label="Your rating" labelClassName="text-sm font-semibold text-primary" required />` is rendered. |
| R3  | Unit Test    | `npx vitest run tests/feedback-form.test.tsx` passes: renders 5 clickable stars, "Your rating" legend, and "Select rating" text when `existing` is null. |
| R4  | Unit Test    | `npx vitest run tests/feedback-form.test.tsx` passes: renders with 5th star checked and "Excellent" label when `existing={{ rating: 5, comment: "Great", status: "APPROVED" }}`. |
| R5  | Unit Test    | `npx vitest run tests/feedback-form.test.tsx` passes: clicking star 4 checks the 4th star and updates label to "Very Good". |
| R6  | Unit Test    | `npx vitest run tests/feedback-form.test.tsx` passes: hovering over star 3 previews "Good" and mouse-leave reverts to current rating label. |
| R7  | Unit Test    | `npx vitest run tests/feedback-form.test.tsx` passes: submitting the form passes `rating` in formData matching the clicked star. |
| R8  | Regression   | `tests/validate-feedback.test.ts` passes; comment textarea and character counter remain present in `FeedbackForm.tsx`. |
| R9  | Unit Test    | `npx vitest run tests/feedback-form.test.tsx` exits 0 with all test cases passing. |
| R10 | Gate 4       | `git diff CHANGELOG.md` shows `#847` entry under `## [Unreleased]`. |
| R11 | Gate 3       | `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run` all exit 0. |
