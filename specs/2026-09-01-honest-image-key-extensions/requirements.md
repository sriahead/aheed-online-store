# Image keys carry the real file extension (requirements)

Issue **#364**. Both key builders suffixed `.webp` unconditionally while three server-side paths
store PNG or whatever a remote server sent, so every server-generated key asserted a format its
object was not. Nothing rendered wrong — the object carries its true content type and the CDN
answers on that — which is why it survived three slices unnoticed. See `plan.md`.

R1. `lib/product-image.ts` exports `imageExtensionForContentType(contentType)` returning the
    matching extension for `image/webp`, `image/png`, `image/jpeg`, `image/svg+xml`, `image/avif`
    and `image/gif`.

R2. It tolerates a real `Content-Type` header: parameters (`image/jpeg; charset=binary`),
    surrounding whitespace, and upper case all resolve to the same extension.

R3. An unrecognised, empty, `null` or `undefined` content type returns `.bin` — **not** `.webp`.

R4. `buildProductImageKey(productId, contentType?)` and
    `buildCampaignImageKey(categoryId, contentType?)` both default to `IMAGE_CONTENT_TYPE`, so a
    call with no content type still produces a `.webp` key.

R5. Given `image/png`, both builders produce a key ending `.png`; given `image/jpeg`, `.jpg`.

R6. `isProductImageKey` and `isCampaignImageKey` still accept **only** `.webp` keys, and reject a
    key the builder produced for a non-WebP content type.

R7. `lib/product-image-pipeline.ts` passes the content type it is about to store to
    `buildProductImageKey`, so the key and the `putObject` content type agree.

R8. `app/api/admin/campaign-images/generate/route.ts` passes its content type to
    `buildCampaignImageKey`, and the key and the `putObject` content type come from one value rather
    than two literals that can drift.

R9. `scripts/copy-product-images.ts` mints the destination key from the copied object's content
    type, and uploads with that same value.

R10. `isPlaceholderImageKey` still returns `false` for a key built with a non-WebP content type.

R11. Unit tests cover R1–R6 and R10, and require no database and no network.

R12. No existing stored key is rewritten, and no migration is added.

R13. `CHANGELOG.md` updated (Gate 4).

R14. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
