# P6b2 — Product image upload via presigned PUT (requirements / acceptance criteria)

Closes #167 and, with it, P6. P6b1 (#159) made every field of a product editable from
`/staff/products/{id}` but left images read-only; this slice adds the image write path. An ADMIN
picks a file, the browser converts it to WebP, the Worker signs a short-lived `PUT`, the browser
uploads straight to object storage, and the product's primary `ProductImage` row repoints to a new
immutable key `products/{productId}/{uuid}.webp`. Nothing is ever overwritten and nothing is ever
deleted. No schema change. Narrative and rejected alternatives: `plan.md`.

R1. `lib/storage.ts`'s exported `StorageService` interface declares `presignPut(key: string,
    contentType: string, expiresInSeconds: number): Promise<string>` and `headObject(key: string):
    Promise<{ contentType: string | null; contentLength: number | null } | null>`, and the object
    returned by `getStorage()` implements both.

R2. `presignPut` returns an absolute URL whose query string contains `X-Amz-Signature`,
    `X-Amz-Credential` and `X-Amz-Expires`, where `X-Amz-Expires` equals the `expiresInSeconds`
    argument, and it issues no network request when called.

R3. `headObject` returns `null` for a key that does not exist in the bucket, and returns the
    object's content type and byte length for one that does.

R4. `lib/product-image.ts` exists and imports none of `@/lib/db`, `@/lib/config`, `@/lib/storage`,
    `@/lib/auth-rbac` or `next/headers` — its unit tests run with no database, session or request.

R5. `lib/product-image.ts` exports `buildProductImageKey`, `isProductImageKey`, `MAX_IMAGE_BYTES`,
    `IMAGE_CONTENT_TYPE`, `MAX_IMAGE_EDGE_PX` and `IMAGE_QUALITY`, with `IMAGE_CONTENT_TYPE ===
    "image/webp"`, `MAX_IMAGE_EDGE_PX === 1200`, `IMAGE_QUALITY === 0.82` and `MAX_IMAGE_BYTES ===
    2 * 1024 * 1024`.

R6. `buildProductImageKey(productId)` returns a string matching
    `^products/<productId>/[0-9a-f-]{36}\.webp$`, and two calls with the same `productId` return
    different strings.

R7. `isProductImageKey(key, productId)` returns `true` for a key `buildProductImageKey(productId)`
    produced, and `false` for each of: a key built for a different product id, a key containing
    `..`, a key with any suffix other than `.webp`, a key with an extra path segment, and a key
    with a leading `/`.

R8. Every export of `features/admin/product-image.ts` is an async function — asserted by a test
    that imports the module and checks each export's `constructor.name === "AsyncFunction"`, not by
    reading the source. (P6b1's #159 trap: a single non-function export makes every action in a
    `"use server"` file fail at runtime while `next build`, `tsc` and `npm test` all stay green.)

R9. `requestImageUpload`'s parameter list contains no key, filename or content-type parameter — the
    storage key is derived server-side from the resolved product and a fresh uuid.

R10. `requestImageUpload` called with no session returns a refusal object (it does not throw and
     does not presign), and called with a session holding no ADMIN role for the acting vendor
     returns a refusal object.

R11. `requestImageUpload` called by an ADMIN of vendor A with a `productId` belonging to vendor B
     returns the same refusal as a `productId` that exists in no vendor, and presigns nothing.

R12. `requestImageUpload` called with a declared byte length greater than `MAX_IMAGE_BYTES` returns
     a refusal and presigns nothing.

R13. `attachProductImage` performs its own ADMIN check and its own vendor-scoped product lookup,
     independent of any prior `requestImageUpload` call — verified by invoking `attachProductImage`
     directly with no preceding `requestImageUpload`.

R14. `attachProductImage` returns a refusal and writes no row when `isProductImageKey(key,
     productId)` is `false`.

R15. `attachProductImage` returns a refusal and writes no row when `headObject(key)` returns
     `null`, when the object's content type is not `image/webp`, or when its byte length exceeds
     `MAX_IMAGE_BYTES`.

R16. For a product with no existing `ProductImage` row, a successful `attachProductImage` creates
     exactly one row with the returned key, `isPrimary: true` and `sortOrder: 0`.

R17. For a product whose primary `ProductImage` row already exists, a successful
     `attachProductImage` updates that row's `storageKey` and `alt` in place; the product's
     `ProductImage` row count is unchanged and the row's `id` is unchanged.

R18. A successful `attachProductImage` leaves every non-primary `ProductImage` row of that product
     unchanged (id, storageKey, sortOrder, isPrimary) — verified against a product given a second,
     non-primary row by hand for the test.

R19. `attachProductImage` writes a non-empty `alt`: the submitted alt text when one is given, and
     the product's `name` when the submitted alt is blank.

R20. Nothing this slice adds can delete an object or a row: `getStorage()` exposes no delete
     method at runtime (`typeof s.deleteObject === "undefined"`), and a product's `ProductImage`
     row count never decreases across two consecutive successful uploads. Asserted behaviourally,
     **not** by grepping the source for the word `delete` — `lib/storage.ts` and `plan.md` both
     name the deletion this slice deliberately omits (#174), so a source grep could only be
     satisfied by removing the explanation.

R21. `components/staff/ProductImageUploader.tsx` carries the `"use client"` directive and imports
     neither `@/lib/storage` nor `@/lib/config` (which would pull `aws4fetch` and the signer into
     the browser bundle — the constraint `ProductForm.tsx:38-45` already documents).

R22. `ProductImageUploader` converts the selected file to `image/webp` before uploading: the
     `PUT` request's body is a `Blob` whose `type` is `image/webp` and whose longest edge is at
     most `MAX_IMAGE_EDGE_PX`, produced via `createImageBitmap(file, { imageOrientation:
     "from-image" })` so EXIF-rotated photographs upload upright.

R23. `/staff/products/{id}` renders the uploader for an existing product, and `/staff/products/new`
     renders no uploader (a product must exist before its image can be keyed on its id).

R24. `attachProductImage` calls `revalidatePath` for `/staff/products/{id}`, `/staff/products`, the
     storefront product path and the category layout, so the new image appears without a manual
     browser refresh.

R25. An `OPTIONS` preflight sent to the staging bucket's S3 endpoint for a `products/…` key with
     `Origin: https://staging.aheedfoodcentre.nocaped.com` and `Access-Control-Request-Method: PUT`
     returns a `2xx` with `access-control-allow-origin` echoing that origin; the same preflight
     with `Origin: https://example.invalid` returns no `access-control-allow-origin` header.

R26. End to end in a **real browser** against `npm run preview`: signed in as an ADMIN, choosing a
     non-WebP image file on `/staff/products/{id}` results in an object present in the staging
     bucket at `products/{productId}/{uuid}.webp` with content type `image/webp`, a `ProductImage`
     row whose `storageKey` is that key, and the new image rendered on the page.

R27. After R26, the same key is fetchable from `${CDN_BASE_URL}/${storageKey}` and returns
     `content-type: image/webp`, with no storefront code changed by this slice.

R28. An ADMIN acting on the SriMart host cannot attach an image to an Aheed product and an ADMIN
     acting on the Aheed host cannot attach one to a SriMart product — both directions tested, both
     refused, no `ProductImage` row written in either case.

R29. `prisma/schema.prisma` is unchanged by this slice (`git diff --stat origin/staging --
     prisma/schema.prisma` is empty) and `prisma/migrations/` gains no directory.

R30. `specs/architecture.md` §3.3 states the immutable `products/{productId}/{uuid}.webp`
     convention and names `putObject`/`presignPut`/`headObject` as the port's actual methods;
     `specs/decisions/ADR-003-storage-abstraction.md` carries an additive implementation note for
     presigned uploads that reopens no existing decision; and `CLAUDE.md`'s storage section gives
     `products/{productId}/{uuid}.webp` as **the** example key. Stated as a positive: both docs
     explain the `{sku}` shape they replace, so the corrected files still contain that string and
     an absence-grep would reward deleting the correction (the mistake P4a's R27 made).

R31. `CHANGELOG.md` updated (Gate 4).

R32. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
