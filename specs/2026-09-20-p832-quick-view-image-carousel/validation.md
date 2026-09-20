# P832 — Quick View Product Image Carousel (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests.
> - **Build:** Verify single-image visibility, arrow controls, pagination indicator, touch swipe handling, and aspect ratio consistency.
> - **Validate:** Verify smooth horizontal transition, keyboard accessibility, and absence of vertical image stacking.
> - **Release:** Confirm Gate 3 and Gate 4 compliance across all quality checks.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit / DOM   | Run `npx vitest run tests/quick-view-image-carousel.test.tsx` verifying carousel container displays only one active slide in the viewport and does not stack images vertically. |
| R2  | Unit         | Run `npx vitest run tests/quick-view-image-carousel.test.tsx` asserting presence of left and right arrow buttons when `images.length > 1`. |
| R3  | Unit         | Run `npx vitest run tests/quick-view-image-carousel.test.tsx` asserting clicking next/previous arrows translates the carousel container and updates the active index. |
| R4  | Unit         | Run `npx vitest run tests/quick-view-image-carousel.test.tsx` verifying `touchstart` and `touchend` swipe events trigger horizontal navigation. |
| R5  | Unit         | Run `npx vitest run tests/quick-view-image-carousel.test.tsx` asserting presence of pagination dots and "1 / N" counter for multi-image products. |
| R6  | Unit         | Run `npx vitest run tests/quick-view-image-carousel.test.tsx` asserting navigation arrows and pagination are omitted when `images.length === 1`. |
| R7  | Unit / CSS   | Run `npx vitest run tests/quick-view-image-carousel.test.tsx` and check that the sliding container includes `duration-300` and `motion-reduce:transition-none`. |
| R8  | Unit         | Run `npx vitest run tests/quick-view-image-carousel.test.tsx` asserting `ArrowLeft` and `ArrowRight` keydown events navigate between images. |
| R9  | Unit / DOM   | Run `npx vitest run tests/quick-view-image-carousel.test.tsx` verifying slides maintain `aspect-square` with fixed sizing. |
| R10 | Process      | Verify `git diff origin/staging CHANGELOG.md` contains an entry for `#832`. |
| R11 | Gate 3       | Run `npm run lint && npm run typecheck && npm run format:check && npx vitest run` and verify all exit 0. |
