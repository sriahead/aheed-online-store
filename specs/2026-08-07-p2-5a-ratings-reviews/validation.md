# P2.5a — Ratings & reviews backend (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `npx prisma migrate status` shows the new migration applied; `prisma/schema.prisma` contains `model Review` with the fields/unique constraint listed in R1, and `Product` has `averageRating`/`reviewCount`; `npx tsc --noEmit` passes (generated Prisma types compile). |
| R2  | `npm run preview` (Workers runtime), submit two reviews as the same user for the same product — the second updates the first (`listByProduct` still returns one row for that user, not two); `Product.averageRating`/`reviewCount` on the DB row match a manual average of that product's actual reviews after each write. |
| R3  | `npx vitest run tests/validate-rating.test.ts` — covers `"4"` → `4`, `"0"`/`"6"` (out of range) → `null`, `""` and non-numeric → `null`. |
| R4  | `npm run preview`, logged in: submitting a valid rating creates/updates the row and the product page shows it without a manual reload. The no-session guard itself is a defense-in-depth check the UI already prevents reaching (R7 hides the form entirely when logged out) — verify by code inspection that `getAuth()`'s session check runs unconditionally before any repository call, not by attempting to bypass the UI. |
| R5  | `npm run preview`, logged in as user A: attempt to delete user B's review (`reviewId` from B) — B's review still exists afterward, `deleteMany`'s reported count is 0; deleting your own review actually removes it and updates the aggregate. |
| R6  | View source on `/products/[slug]` while authenticated — a plain `<form>` with no `<script>`-driven behavior; if the caller already reviewed the product, the rating/comment fields are pre-filled with their existing values, not blank. |
| R7  | `npm run preview`, visit `/products/[slug]` logged out — review list still renders (if any reviews exist), "log in to leave a review" prompt shown instead of the form, no redirect away from the page. |
| R8  | `grep -rn "@prisma/client" app components features` (excluding `lib/`) returns nothing. |
| R9  | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` — all exit 0. |
| R10 | `git diff origin/staging...HEAD --name-only` includes `CHANGELOG.md`. |
