# Catalogue debt bucket: broken homepage rows, real featured flag, multi-image admin management (requirements / acceptance criteria)

Closes issue **#211**, itself closing **#173**, **#174** and **#208** (repeated `closes` keyword on
the eventual promotion PR). Builds on `docs/gap-register.md`'s GAP-013/014/015 rows and
`plan.md`'s narrative. GAP-011 is explicitly out of scope — see `plan.md`'s excluded section.

## Broken homepage rows

R1. `lib/repositories/products.ts`'s `ProductRepository` interface gains a method that returns a
    filtered, paginated product page without requiring search text (`search()`'s existing
    empty-query behaviour is unchanged). `app/(storefront)/page.tsx` calls this new method for both
    its rows instead of calling `search("", ...)`.

R2. A real browser or headless request against `npm run preview`'s `/` shows the "New Arrivals" row
    rendering at least one product card (true regardless of `isFeatured` state — proves the
    homepage no longer misuses `search("")` for that row). Separately, pick one product currently
    NOT flagged `isFeatured` (or unflag one first): confirm it is absent from the "Featured
    Products" section (or the section itself is absent, if it was the only one flagged) at `/`,
    then flag it `isFeatured` through the admin form (R5), then confirm a fresh request to `/` now
    shows a "Featured Products" row containing that product by name.

## Real `isFeatured` flag (#208)

R3. `prisma/schema.prisma`'s `Product` model has an `isFeatured Boolean @default(false)` field, and
    a migration exists under `prisma/migrations/` that adds it additively (no data loss, no
    manual data migration required).

R4. `lib/catalogue-form.ts`'s `ProductFormValues` has an `isFeatured: boolean` field;
    `parseProductForm` sets it via the same `checkbox()` helper used for `isHalal`/`isFresh`/
    `isOrganic`; `PRODUCT_FIELDS` includes `"isFeatured"`.

R5. `components/staff/ProductForm.tsx` renders an `isFeatured` checkbox using the same `Checkbox`
    component as `isHalal`/`isFresh`/`isOrganic`, and `createProductForVendor`/
    `updateProductForVendor` in `lib/repositories/products.ts` persist the submitted value.

R6. The homepage's second product row's title is "Featured Products" (not "Featured Halal Deals"),
    and its query (via R1's method) filters on `isFeatured: true` with no reference to `isHalal`
    anywhere in that call. `ProductFilters` and `buildFilterWhere` (`lib/repositories/products.ts`)
    gain an `isFeatured` filter, following the same shape as the existing `isHalal`/`isFresh`/
    `isOrganic` filters.

## Multi-image admin management (#173, #174)

R7. `lib/storage.ts`'s `StorageService` interface has a `deleteObject(key: string): Promise<void>`
    method, implemented via the S3-compatible DeleteObject call using the existing `aws4fetch`
    client (same pattern as `putObject`/`headObject`) — no new dependency, no R2-specific API.

R8. `lib/repositories/products.ts` exports `addProductImage(vendorId, productId, storageKey, alt)`:
    creates a new `ProductImage` row for the product. `isPrimary` is `true` only if the product
    currently has zero images, `false` otherwise. `sortOrder` is one greater than the product's
    current maximum `sortOrder` (or `0` if it has no images).

R9. `lib/repositories/products.ts` exports `promoteProductImage(vendorId, productId, imageId)`:
    in one transaction, sets the target row's `isPrimary` to `true` and clears `isPrimary` on
    whichever row previously held it. Neither row's `storageKey` changes.

R10. `lib/repositories/products.ts` exports `removeProductImage(vendorId, productId, imageId)`:
     deletes the target `ProductImage` row and calls `deleteObject` (R7) on its `storageKey`. If the
     removed row was primary and the product has other images remaining, the row with the lowest
     remaining `sortOrder` is promoted to primary in the same operation.

R11. `lib/repositories/products.ts` exports
     `reorderProductImages(vendorId, productId, orderedImageIds: string[])`: rewrites every
     remaining row's `sortOrder` to its zero-based index in `orderedImageIds`. If the given id set
     does not exactly match the product's current image ids, no row is written and the function
     returns a failure result.

R12. `features/admin/product-image.ts` exports four new server actions —
     `addProductImage`, `promoteProductImage`, `removeProductImage`, `reorderProductImages` —
     each independently calling `requireVendorRole("ADMIN")` before touching R8-R11, matching the
     existing `attachProductImage`/`requestImageUpload` posture. `attachProductImage` and
     `setPrimaryProductImage` are unchanged.

R13. `getProductForAdmin` (`lib/repositories/products.ts`) selects `id` and `sortOrder` on each
     `ProductImage` row (currently only `storageKey`/`alt`/`isPrimary`), and
     `app/(admin)/staff/products/[id]/page.tsx` passes that data through to `ProductForm`.

R14. `components/staff/ProductForm.tsx`'s Images section lists every image the product has, and for
     each one exposes: a "Set primary" control (absent on the current primary), a "Remove" control,
     and up/down reorder controls (absent where not applicable — first image has no "up", last has
     no "down"). It also exposes an "Add another image" upload path, distinct from and in addition
     to the existing primary-replacing upload, which is unchanged.

R15. Live, against `npm run preview`: starting from a product with exactly one image, uploading a
     second via "Add another image" results in two `ProductImage` rows for that product (verified by
     re-fetching the product's edit page and observing two images listed). Clicking "Set primary" on
     the second image flips `isPrimary` between the two rows without changing either row's
     `storageKey` (the storefront's primary image changes to the second upload). Removing the
     now-demoted image deletes its row (no longer listed) and its storage object is actually gone
     (`headObject` on its key, checked via a temporary script or the storage provider's console,
     returns null/not-found afterward). With two remaining images, reordering them updates the
     order shown on both the admin edit page and the storefront's `ProductImageGallery`.

## Standing-decision docs

R16. `specs/architecture.md` §3.3 and `specs/decisions/ADR-003-storage-abstraction.md` both
     document `deleteObject` as a real port method (not "deliberately absent"), and both front-matter
     `version` fields are bumped.

## Register and roadmap reconciliation

R17. `docs/gap-register.md`'s GAP-013 row and detailed section state `Status: Fixed` (not
     `Fixed (partial)`), citing this slice's `isFeatured` implementation. GAP-014 and GAP-015 both
     state `Status: Fixed`, each citing the concrete files/functions from R8-R12.

R18. `specs/roadmap.md`'s change log has a dated row for this slice, and its front-matter `version`
     is bumped.

## Gates

R19. `CHANGELOG.md` updated (Gate 4).

R20. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
