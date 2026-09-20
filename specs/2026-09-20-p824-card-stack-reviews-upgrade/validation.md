# P824 — Vibrant Card-Stack Review Slider (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests.
> - **Build:** Verify the component palettes, 3D stacked transforms, responsive containment, and existing elements.
> - **Validate:** Verify the interactive card deck advances smoothly, maintains accessibility, and passes all gates.
> - **Release:** Confirm no horizontal overflow, zero regressions on mobile or desktop, and green quality checks.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit         | Run `npx vitest run tests/customer-feedback-cards.test.tsx` verifying `CARD_PALETTES.length >= 6` with distinct background and border classes. |
| R2  | Unit         | Run `npx vitest run tests/customer-feedback-cards.test.tsx` asserting cards at indices 0, 1, 2, ... receive palette classes matching `index % CARD_PALETTES.length`. |
| R3  | Unit         | Run `npx vitest run tests/customer-feedback-cards.test.tsx` checking that computed contrast ratio of text against all palette background tints is >= 4.5:1. |
| R4  | Integration  | Run `npx vitest run tests/customer-feedback-cards.test.tsx` asserting rendered header contains "What our customers say", star rating, numeric average, review count text, and link href `"/feedback"`. |
| R5  | Integration  | Run `npx vitest run tests/customer-feedback-cards.test.tsx` asserting card output includes 5-star rating, "Verified customer" badge (for `verifiedPurchase: true`), comment text, author name, and relative date. |
| R6  | Unit         | Run `npx vitest run tests/card-stack.test.tsx` verifying front card has `scale(1)` with `depth === 0`, and background cards receive depth transforms with scale reduction (`scale < 1`) and `translateZ`. |
| R7  | Unit         | Run `npx vitest run tests/card-stack.test.tsx` verifying Next and Previous actions trigger the exit animation state and advance the active index. |
| R8  | Unit         | Run `npx vitest run tests/card-stack.test.tsx` verifying pointer drag events update drag offset and advance card when swipe threshold (50px) is exceeded. |
| R9  | Integration  | Run `npx vitest run tests/card-stack.test.tsx` verifying clicks on Next/Prev buttons, ArrowLeft/ArrowRight key events, and "X / total" text counter updates. |
| R10 | Regression   | Verify `components/ui/CardStack.tsx` and `app/globals.css` contain `overflow: hidden` bounding wrapper, preventing horizontal page overflow down to 320px viewport width. |
| R11 | Unit / CSS   | Inspect `app/globals.css` and verify `@media (prefers-reduced-motion: reduce)` block clears transforms on `.card-stack-item` and sets horizontal scroll layout. |
| R12 | Unit         | Run `npx vitest run tests/customer-feedback-cards.test.tsx` asserting `CustomerFeedbackCards` returns `null` when `feedback` is an empty array `[]`. |
| R13 | Integration  | Run `npx vitest run tests/customer-feedback-cards.test.tsx` asserting `ReviewLinkGroup` renders external links when `reviewLinks` is populated. |
| R14 | Process      | Verify `git diff CHANGELOG.md` contains an entry for `#824` under Post-launch improvements / Storefront. |
| R15 | Gate 3       | Run `npm run lint && npm run typecheck && npm run format:check && npx vitest run` and verify all commands exit 0 with zero errors. |
