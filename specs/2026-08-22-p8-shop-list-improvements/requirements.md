# P8.x Shop Your List Improvements (requirements)

This slice resolves Issue #115 (partial-match fallback) and addresses UI feedback regarding "Shop your list" discoverability and Cart popover behavior.

R1. `resolveLines` in `lib/shopping-list.ts` falls back to partial matches if no product matches all terms. It must return candidates with the highest number of matching terms as `ambiguous` (capped at `MAX_CANDIDATES_PER_LINE`), allowing the user to select them.
R2. The global header must include a visible link or button to `/shop-your-list`, placed near the search input.
R3. Clicking "Proceed to checkout" or "View full cart" inside the Cart popover/FAB must automatically close the popover.
R4. `CHANGELOG.md` updated (Gate 4).
R5. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
