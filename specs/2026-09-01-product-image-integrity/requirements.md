# Product image integrity (requirements / acceptance criteria)

Closes #502, slice B of the three approved at Gate 1 on 2026-09-01 (slice A is #501, slice C is
#503). Four compounding defects: `prisma/seed.ts`'s generated-catalogue path returns before its own
placeholder uploads so staging references image keys that 404; the "Auto-fill Missing Images" job
looks for products with no image row when every product already has a placeholder row, so it
matches nothing; `saveGeneratedProductImage` writes `isPrimary: false` so a filled image would not
display anyway; and `lib/product-metadata.ts` accepts Open Food Facts' top hit with no relevance
check, returning the same image for similarly-named products, on the one code path that never sets
`needsReview`. See `plan.md` for the measured evidence behind each.

Throughout, **"placeholder key"** means a `ProductImage.storageKey` whose final path segment is
`main.svg` — the shape both seed paths write (`products/{slug}/main.svg` and
`products/gen-{categorySlug}/main.svg`). A real uploaded image is
`products/{productId}/{uuid}.webp` from `buildProductImageKey`, which never ends that way.

R1. `lib/product-image.ts` exports `isPlaceholderImageKey(key: string): boolean`, which returns
    `true` for `products/cat-litter-5kg/main.svg` and for `products/gen-south-asian/main.svg`, and
    `false` for the return value of `buildProductImageKey("<any-product-id>")`.

R2. `prisma/seed.ts`'s `seedGeneratedCatalogue` issues its placeholder `putObject` uploads on a run
    against a database that already holds at least `count` generated products — i.e. the uploads
    are no longer positioned after the `existing >= count` early return.

R3. `scripts/restore-placeholder-images.ts` exists, runs under `npx tsx`, and for the database its
    environment resolves uploads one object per distinct placeholder key referenced by any
    `ProductImage` row. It prints the number of distinct keys uploaded. It issues no database
    writes.

R4. Running `scripts/restore-placeholder-images.ts` twice in a row against the same environment
    exits 0 both times and reports the same distinct-key count on the second run as the first.

R5. After R3's script is run against staging, every URL of the form
    `https://images.staging.aheedfoodcentre.nocaped.com/<key>` returns HTTP 200 for every distinct
    placeholder key present in the staging database.

R6. `components/product/ProductCard.tsx` renders the grey `bg-surface-muted` fallback box in place
    of the `<img>` after that `<img>` emits an `error` event, without a full page navigation.

R7. `getProductsWithoutImages` in `lib/repositories/products.ts` returns a product whose only
    `ProductImage` row carries a placeholder key, in addition to a product with no `ProductImage`
    row at all, and excludes a product whose primary image is a non-placeholder key.

R8. After `saveGeneratedProductImage` runs for a product whose only existing image was a
    placeholder, that product has exactly one `ProductImage` row marked `isPrimary: true`, and its
    `storageKey` is the newly generated key.

R9. `lib/product-metadata.ts` exports a pure matcher that, given a product name and a candidate
    Open Food Facts product name, returns `false` when the two share no token of three or more
    characters, and `true` when they share at least one. `fetchImageUrl`'s text-search path returns
    `null` rather than an image URL when the matcher rejects the candidate.

R10. `runProductImagePipeline` returns `needsReview: true` for a result sourced from Open Food
     Facts, as it already does for a result sourced from AI generation.

R11. `runProductImagePipeline` accepts an option that, when set to disable Open Food Facts, issues
     no request to any `openfoodfacts.org` URL and proceeds directly to AI generation.

R12. `components/staff/BackfillImagesButton.tsx` renders a checkbox controlling R11's option,
     checked by default, and `app/api/admin/jobs/backfill-images/route.ts` passes the submitted
     value through to `runProductImagePipeline`.

R13. `POST /api/admin/jobs/backfill-images` continues to refuse a request from a non-ADMIN caller
     with the status `requireVendorRole("ADMIN")` returns, unchanged by this slice.

R14. `CHANGELOG.md` updated (Gate 4).

R15. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
