# P832 — Quick View Product Image Carousel (requirements / acceptance criteria)

This slice upgrades the Quick View product drawer image gallery to display multiple product images in a compact, single-image horizontal carousel with smooth transitions, touch swipe gestures, accessible arrow buttons, and pagination indicators.

R1. In the Quick View product drawer, multiple product images are NOT stacked vertically; only one main product image is displayed at a time within a consistent aspect-square container.

R2. When a product has multiple images (`images.length > 1`), left and right navigation arrow buttons are displayed overlaying the image.

R3. Clicking the left or right navigation arrows smoothly transitions horizontally to the previous or next product image respectively, wrapping around at the edges.

R4. Touch swipe gestures on mobile and touch devices horizontally advance to the previous (swipe right) or next (swipe left) image.

R5. When a product has multiple images, pagination indicators are displayed showing clickable dot indicators and a "X / total" count.

R6. Navigation arrows and pagination indicators are hidden when the product has only a single image (`images.length <= 1`).

R7. Image transitions animate with smooth horizontal sliding transitions (`transition-transform duration-300`), degrading to instant switching when `prefers-reduced-motion` is active (`motion-reduce:transition-none`).

R8. Arrow keys (ArrowLeft and ArrowRight) navigate through images when the carousel is focused.

R9. The image area maintains consistent fixed aspect-square dimensions when switching between images to prevent layout shift and keep drawer contents compact.

R10. `CHANGELOG.md` updated with an entry for `#832` under Post-launch improvements / Storefront (Gate 4).

R11. `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run` all exit 0 with zero errors (Gate 3).
