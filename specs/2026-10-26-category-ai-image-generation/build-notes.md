# Category AI Image Generation & Backfill — Build Notes

Tracking Issue: [#1283](https://github.com/sriahead/aheed-online-store/issues/1283)
Branch: `feature/category-ai-image-generation`

## What Changed and Why

1. **`lib/category-image.ts` (Pure Module)**
   - Defines `buildCategoryImageKey(vendorId, slug, contentType)` returning deterministic relative keys `categories/{vendorId}/{slug}-{random}{ext}`.
   - Defines `buildCategoryImagePrompt(categoryName, style)` generating specialized prompts tailored for:
     - `photo`: Commercial studio grocery photography with soft studio ambient lighting, clean background, sharp focus, genuine food presentation (Tesco model).
     - `3d-icon`: Commercial 3D rendered isometric app icon on pure white `#ffffff` with tactile smooth materials and soft contact shadow.

2. **`lib/category-image-pipeline.ts` (Image Pipeline)**
   - Implements `runCategoryImagePipeline(categoryId, style, vendorId, options)`.
   - Checks vendor daily AI allowance via `options.aiMeter.check()`.
   - Generates imagery via Cloudflare Workers AI (`@cf/black-forest-labs/flux-1-schnell`).
   - Persists buffer to R2 object storage via `storage.putObject()`.
   - Records AI usage in the vendor ledger via `aiMeter.recordImage()`.
   - Updates the category record in Neon Postgres via `updateCategoryForVendor()`.

3. **`app/api/admin/category-images/generate/route.ts`**
   - RBAC protected: `requireVendorRole("ADMIN")`.
   - Generates an image on demand for a single category.
   - Revalidates `/staff/categories`, `/staff/categories/[id]`, `/categories`, and `/`.
   - Returns HTTP 429 when vendor AI budget is reached via `describeAiBudgetRefusal`.

4. **`app/api/admin/category-images/backfill/route.ts`**
   - RBAC protected: `requireVendorRole("ADMIN")`.
   - Identifies all categories without an `imageKey` and processes up to 5 per batch.
   - Halts cleanly if vendor daily budget is exhausted without failing existing categories.

5. **`components/staff/CategoryImageManager.tsx`**
   - Rendered inside `CategoryForm` for existing categories.
   - Features style selector (`photo` vs `3d-icon`), real-time preview via `ImageWithFallback`, auto-generate trigger with loading state, and error banner.

6. **`components/staff/BackfillCategoryImagesButton.tsx`**
   - Rendered on the `/staff/categories` list page above the table.
   - Displays count of categories missing images and provides batch generation trigger with visual feedback.

7. **`lib/repositories/categories.ts`**
   - Added `imageKey` to `AdminCategoryRow` and included `imageKey: true` in `listCategoriesForAdmin` select, enabling missing image count calculation for the backfill button.

8. **Tests & KMS Standards**
   - Created `tests/category-image-generation.test.ts` (11 tests, all passing).
   - Updated `docs/client-help-centre/category-image-standards.md` with instructions for one-click generation and bulk backfill.
   - Rebuilt and validated KMS index.
