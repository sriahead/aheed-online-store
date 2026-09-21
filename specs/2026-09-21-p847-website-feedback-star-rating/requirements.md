# P847 — Website Feedback Clickable Star Rating (requirements / acceptance criteria)

This slice updates the Website Feedback rating UI on `/feedback` to match the Product Feedback rating UI, replacing the radio-button pills with the shared `StarRatingInput` component.

R1. The radio-button pill group in `components/storefront/FeedbackForm.tsx` is removed and replaced with the shared `StarRatingInput` component.

R2. The `StarRatingInput` rendered in `FeedbackForm.tsx` carries `name="rating"`, `label="Your rating"`, and `labelClassName="text-sm font-semibold text-primary"`.

R3. When `existing` is null, `StarRatingInput` renders with no stars pre-selected and displays the "Select rating" indicator label.

R4. When `existing` carries a rating, `StarRatingInput` receives `defaultValue={existing.rating}`, pre-filling the selected star and its matching descriptive label (e.g. "Excellent" for 5 stars).

R5. Clicking a star (1–5) updates the selected rating, fills stars 1 through the clicked star in amber, and updates the descriptive rating indicator label ("Poor", "Fair", "Good", "Very Good", "Excellent").

R6. Hovering over any star illuminates stars 1 through the hovered star with amber fill and previews the hovered label, reverting to the selected rating upon mouse leave.

R7. Submitting the feedback form serializes the selected rating value into `FormData` with key `"rating"` (`"1"`–`"5"`), matching `submitFeedback`'s expected input.

R8. Existing feedback form behaviors — comment textarea, character limit counter, pending disabled state, error alert banner, and success status banner — remain unchanged.

R9. Automated unit tests in `tests/feedback-form.test.tsx` verify default rendering, pre-filled editing state, star click interaction, hover preview, and form submission.

R10. `CHANGELOG.md` updated with an entry for `#847` under `## [Unreleased]` (Gate 4).

R11. `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run` all exit 0 with zero errors (Gate 3).
