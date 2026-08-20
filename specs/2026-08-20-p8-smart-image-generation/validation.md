# P8 — Smart Product Image Generation (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `npx prisma migrate dev --name p8_image_needs_review` applies successfully; Prisma client compiles. |
| R2  | Write a temporary test script or call the internal function to verify it returns a valid URL from Open Food Facts. |
| R3  | Verify the `ImageGenerationService` is implemented as a standard `fetch` call and successfully returns an image buffer when valid CLOUDFLARE env vars are present. |
| R4  | `npm run preview`. Authenticate as an Admin. Send a `POST` to `/api/admin/product-images/generate`. Verify it returns a valid storage key and the image is accessible via the CDN URL. |
| R5  | `npm run preview`. Create a dummy product with no image. Call `POST /api/admin/jobs/backfill-images`. Verify the product's `imageKey` is populated and `imageNeedsReview` is accurate. |
| R6  | Open the product creation/edit page in the admin panel. Click "Auto-Generate Image". Verify the preview loads on-screen. |
| R7  | Check the products list view in the admin panel. Ensure products needing review are identifiable and filterable. |
| R8  | Run `npm run format:check && npm run lint && npm run typecheck && npm run test`. All must exit 0. |
| R9  | Ensure `CHANGELOG.md` has an entry for this feature. |
