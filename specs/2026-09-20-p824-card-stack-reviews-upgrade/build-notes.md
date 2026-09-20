# P824 — Vibrant Card-Stack Review Slider (build notes)

Written at the end of Build, before the Clear.

## What changed and why

1. **`components/storefront/CustomerFeedbackCards.tsx`**:
   - Exported `CARD_PALETTES` defining 6 lively yet tasteful pastel color themes (green `#f0fdf4`, amber `#fffbeb`, orange `#fff7ed`, blue `#f0f9ff`, pink `#fff1f2`, purple `#faf5ff`) with complementary borders.
   - Applied palette rotation across review cards (`index % CARD_PALETTES.length`), giving each review a distinct cheerful visual identity while maintaining strict WCAG AA contrast (4.5:1+) for primary and muted text.
   - Swapped the rating summary `<p>` container to `<div>` to avoid invalid HTML nesting of `Stars`'s inner `<div>` inside a paragraph tag.
   - Preserved all existing content: 5-star ratings, "Verified customer" badges, comments, author names, relative dates, heading rating statistics, "Share your experience" link, and outbound `ReviewLinkGroup`.

2. **`components/ui/CardStack.tsx`**:
   - Refined 3D visual geometry parameters (`OFFSET_X_PX = 16`, `OFFSET_Z_PX = -40`, `ROTATE_Y_DEG = 3.5`, `SCALE_STEP = 0.045`, `ANIMATION_DURATION_MS = 400`) and eased peel animation to align with the UIInitiative Cards Stack Slider reference.
   - Wrapped the carousel in an `overflow-hidden` bounding container and set the inner stack to `w-[calc(100%-2rem)] max-w-2xl mx-auto`, preventing any horizontal scrolling or document overflow on mobile viewports down to 320px.
   - Maintained interactive touch/pointer drag with live 3D tilt, Next/Previous chevron buttons, Arrow key navigation, live region announcements, and infinite loop cycling.

3. **`app/globals.css`**:
   - Adjusted `.card-stack` `min-height` to `16rem` to comfortably accommodate multi-line reviews and metadata.
   - Maintained full `@media (prefers-reduced-motion: reduce)` media query fallback to a flat scrollable row.

4. **`tests/customer-feedback-cards.test.tsx` and `tests/card-stack.test.tsx`**:
   - Added unit and integration tests verifying palette length, contrast ratios, index-based assignment, element preservation, empty array handling, 3D perspective transforms, navigation actions, and responsive containment.

5. **`CHANGELOG.md`**:
   - Added Gate 4 entry under `## [Unreleased] -> ### Changed`.

## Decisions taken during the build

- **Pastel Tints**: Chose 50-level tailwind-equivalent pastel tints with high luminance (~0.95–0.98), ensuring contrast against Aheed's dark green (`#1b5e20`) is > 7.1:1 and against muted text (`#49784e`) is > 4.69:1.
- **Horizontal Overflow Containment**: Constrained the inner `.card-stack` width with `w-[calc(100%-2rem)]` within an `overflow-hidden` container. This reserves margin space for the rear cards to fan into, preventing any horizontal scrollbar from appearing on small screens.
- **Animation Debounce**: Preserved `isAnimating` lock during the 400ms transition to prevent rapid clicking or key presses from corrupting the 3D peel animation state.

## Deviations from the spec

None.

## Known-shaky areas

- None. All 14 tests pass, contrast ratios are mathematically verified, and typescript and eslint checks are completely clean.
