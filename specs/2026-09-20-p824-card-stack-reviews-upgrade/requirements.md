# P824 — Vibrant Card-Stack Review Slider (requirements / acceptance criteria)

This slice upgrades the storefront customer feedback section (`components/storefront/CustomerFeedbackCards.tsx` and `components/ui/CardStack.tsx`) to implement a lively, rotating pastel color scheme for review cards and smooth 3D stacked-card transitions inspired by the UIInitiative Cards Stack Slider reference, while preserving all existing review content, rating headers, badges, and navigation controls.

R1. `components/storefront/CustomerFeedbackCards.tsx` defines a cycle of at least 6 distinct, tasteful pastel theme styles (including soft green, warm yellow/amber, soft orange, sky blue, rose/pink, and soft purple/lavender), each pairing a light background tint with a complementary border.

R2. Each review card rendered by `CustomerFeedbackCards` is assigned one of the pastel color themes deterministically according to its zero-based index (`index % palette.length`).

R3. Every pastel theme background maintains a contrast ratio >= 4.5:1 against the foreground text classes `text-primary` and `text-primary-muted`, complying with WCAG AA requirements for normal body text.

R4. `CustomerFeedbackCards` preserves all existing header elements: section heading ("What our customers say"), aggregate star rating icons, numerical score (`summary.averageRating.toFixed(1)`), review count text (`from X reviews`), and the "Share your experience" link targeting `/feedback`.

R5. Each review card in `CustomerFeedbackCards` preserves all existing content elements: 5-star rating display, "Verified customer" badge with checkmark icon (rendered conditionally for verified purchases), review comment text, author name, and relative submission date (`relativeDate`).

R6. `components/ui/CardStack.tsx` arranges cards in a prominent 3D perspective stack where the active card (`depth = 0`) is positioned front and center at full scale (`scale(1)`), and background cards (`depth > 0`) are tiered with vertical offset (-22px per level) and depth displacement in Z, allowing the lively pastel background and border of cards behind to clearly peek out above the front card.

R7. `components/ui/CardStack.tsx` enables direct card interaction: clicking the front card advances to the next review; clicking any visible background card immediately brings it to the front. Smooth 3D peel/slide animations smoothly transition cards between positions.

R8. `components/ui/CardStack.tsx` supports pointer and touch drag gestures that interactively translate and tilt the active card with the pointer, advancing the stack when dragged past a threshold.

R9. In accordance with user refinement, previous and next arrow buttons are removed in favor of direct card clicking, touch drag/swipe, accessible keyboard navigation (ArrowLeft/ArrowRight/ArrowUp/ArrowDown/Space/Enter), pagination indicator pills, and visible "X / total" slide counter.

R10. The card stack container and its items prevent horizontal page overflow and horizontal scrollbars across all screen widths down to 320px.

R11. Under `prefers-reduced-motion: reduce`, `components/ui/CardStack.tsx` and `app/globals.css` gracefully degrade the stack into a horizontal scrollable row with zero 3D transforms.

R12. When the feedback array is empty, `CustomerFeedbackCards` returns `null` and renders no empty container or heading.

R13. `ReviewLinkGroup` outbound review links are preserved and render below the card stack when review links exist.

R14. `CHANGELOG.md` updated with an entry for `#824` under post-launch improvements / storefront (Gate 4).

R15. `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run` all exit 0 with zero errors (Gate 3).
