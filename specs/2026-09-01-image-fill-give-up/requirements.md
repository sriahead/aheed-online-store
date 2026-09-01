# A give-up path for products the image pipeline can never fill (requirements)

Issue **#523**. Workers AI permanently refuses some legitimate halal meat product names as NSFW
(`Halal Chicken Thighs 1kg`, four attempts across three runs). `getProductsWithoutImages` is
newest-first and bounded, so without a record of failed attempts such a product is re-selected on
every scheduled run, consumes a slot, fails, and leaves the fillable backlog untouched while the
job reports success. See `plan.md`.

R1. `Product` has an `imageAttemptFailures` integer column defaulting to `0`, created by a
    migration checked in with this slice.

R2. That migration's executable SQL contains **no** `DROP INDEX` statement, and the three
    `pg_trgm` indexes (`Order_guestEmail_trgm_idx`, `Order_orderNumber_trgm_idx`,
    `User_email_trgm_idx`) still exist in the database after it is applied.

R3. `lib/product-image.ts` exports `MAX_IMAGE_ATTEMPT_FAILURES` and a pure
    `hasExhaustedImageAttempts(failures)` returning true at or above it and false below.

R4. `MAX_IMAGE_ATTEMPT_FAILURES` is greater than 1 and no greater than 5.

R5. Unit tests cover `hasExhaustedImageAttempts` below, at, and above the threshold, and require no
    database and no network.

R6. `recordImageAttemptFailure(prisma, vendorId, productId)` in `lib/repositories/products.ts`
    increments the counter by one, uses a singular `update` (never `updateMany`), and scopes its
    `where` by `vendorId`.

R7. `getProductsWithoutImages` does not return a product whose `imageAttemptFailures` is at or above
    `MAX_IMAGE_ATTEMPT_FAILURES`, and still returns one below it.

R8. `saveGeneratedProductImage` resets `imageAttemptFailures` to `0`.

R9. Both fill paths record a failure: `scripts/fill-product-images.ts` (on a thrown error **and** on
    a null pipeline result) and `app/api/admin/jobs/backfill-images/route.ts` (on a thrown error).
    Neither aborts its loop when recording the failure itself fails.

R10. `countProductsWithExhaustedImageAttempts(prisma, vendorId)` returns the number of products that
     still lack a real image and are at or above the threshold, and
     `scripts/fill-product-images.ts` prints that number in its summary when it is greater than 0.

R11. `recordImageAttemptFailure` does not increment a product belonging to a different vendor than
     the `vendorId` passed.

R12. `lib/products-service.ts` exposes `recordImageAttemptFailure` under the same name, resolving
     its own client, so the admin route calls it by that name.

R13. `CHANGELOG.md` updated (Gate 4).

R14. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
