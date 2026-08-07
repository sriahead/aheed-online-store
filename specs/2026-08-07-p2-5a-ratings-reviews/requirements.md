# P2.5a — Ratings & reviews backend (requirements / acceptance criteria)

First slice of P2.5 (`specs/roadmap.md` v1.2.0), inserted between P2 and P3. Real `Review` data
before P2.5b's visual redesign displays it. Builds on P1's auth (session gating) and P2's
`Product`/`ProductRepository` (already merged, live).

R1. `prisma/schema.prisma` gains `Review` (`id`, `rating` Int 1–5, `comment` String?, `userId` FK
    → `User` with `onDelete: Cascade` — matches `Session`/`Account`'s existing pattern, no
    orphaned reviews if a user is deleted — `productId` FK → `Product`, `createdAt`, `updatedAt`,
    `@@unique([userId, productId])`, `@@index([productId, createdAt])` for `listByProduct()`'s
    query) and `Product` gains `averageRating` (Float, `@default(0)`) and `reviewCount` (Int,
    `@default(0)`). Migration applied via `prisma migrate dev` against the real Neon staging
    instance (same pattern every prior slice used) and committed under `prisma/migrations/`.
R2. `lib/repositories/reviews.ts` exports a `ReviewRepository` interface and
    `getReviewRepository()` factory (Prisma-backed, constructed fresh per call, never cached
    across requests — same contract as every other repository in this codebase):
    - `upsert(userId, productId, rating, comment)`: creates or updates (on the `@@unique`
      conflict) the caller's review for that product, then recomputes `Product.averageRating`/
      `reviewCount` from a full `aggregate()` over that product's reviews — not incrementally —
      inside a single `prisma.$transaction`.
    - `delete(reviewId, userId)`: deletes via `deleteMany({ where: { id, userId } })` (atomic
      ownership check, not a separate read-then-check), then recomputes the aggregate in the same
      transaction only if a row was actually deleted.
    - `listByProduct(productId, take)`: the `take` most recent reviews (newest-first) for a
      product, including each reviewer's `name` from the `User` relation. No cursor/pagination
      parameter — deliberately bounded, per `plan.md`.
    - `getByUserAndProduct(userId, productId)`: the caller's existing review for a product, if
      any (used to pre-fill the submission form), or `null`.
R3. `features/reviews/validate-rating.ts` exports a pure function
    `parseRating(value: string): number | null` — `"4"` → `4`, out-of-range (`"0"`, `"6"`),
    non-numeric, or blank input → `null`. Unit-tested, no Prisma/network dependency, same pattern
    as `components/product/parse-price-input.ts`.
R4. `features/reviews/submit-review.ts` exports a `"use server"` action: reads the current
    session via `getAuth()`; with no session, throws rather than writing anything. Validates the
    submitted rating via `parseRating()`; an invalid rating throws before touching the
    repository. On success, calls `upsert()` and revalidates the product's page path so the new
    review appears without a manual refresh.
R5. `features/reviews/delete-review.ts` exports a `"use server"` action: reads the session the
    same way; with no session, throws. Calls `delete()` with the session's `userId` — deleting
    another user's review is a no-op (zero rows matched), not an error, per R2's ownership check.
    Revalidates the product page path.
R6. `features/reviews/components/ReviewForm.tsx`: a plain `<form action={submitReview}>` (no
    `"use client"`, progressively enhances the same way P2's GET forms did) — a rating `<select>`
    (1–5, `required`) and an optional comment `<textarea>`, pre-filled from
    `getByUserAndProduct()` if the caller already reviewed this product.
R7. `app/(storefront)/products/[slug]/page.tsx` extended: shows `listByProduct()`'s results
    (reviewer name, rating, comment, date) below the existing product details. Authenticated
    visitors see `ReviewForm`; unauthenticated visitors see a "log in to leave a review" prompt
    linking to `/login` — the page itself stays reachable without auth, no regression to guest
    browsing.
R8. Presentation code (`app/`, `components/`, `features/`) never imports `@prisma/client`
    directly — reviews reach the DB only through `lib/repositories/reviews.ts`.
R9. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
R10. `CHANGELOG.md` updated (Gate 4).
