# Requirements: AI Image Generation for Category Icons & Departments

**Tracking issue:** `#1283`  
**Slice:** `specs/2026-10-26-category-ai-image-generation/`  
**Base branch:** `staging`  
**Feature branch:** `feature/category-ai-image-generation`  

---

## 1. Problem Statement

Operators managing the store catalogue have an automated "Auto-generate image" button for individual products (`ProductImageManager.tsx`) and a bulk backfill tool (`BackfillImagesButton.tsx`), backed by Workers AI (`@cf/black-forest-labs/flux-1-schnell`) and S3/R2 storage.

In contrast, category image and icon management (`CategoryForm.tsx`) only provides a raw text input for `imageKey`. Operators cannot generate matching commercial product photographs or 3D icons from within the staff administration panel, forcing manual creation, cropping, and S3 uploads.

---

## 2. Requirements (R1 – R10)

### R1. Backend Pipeline (`lib/category-image-pipeline.ts`)
The server provides `runCategoryImagePipeline(categoryId: string, style: 'photo' | '3d-icon', vendorId: string, options: { aiMeter: AiMeter })`:
- Validates vendor ownership of the category.
- Server constructs a standardized, non-generic prompt adhering to platform standards:
  - If `style === 'photo'`: Commercial studio grocery/retail photography of products representing the category, isolated on clean white background, 1:1 aspect ratio, bright natural studio lighting.
  - If `style === '3d-icon'`: Commercial 3D rendered clay/metallic app icon representing the category with glossy highlights, 45-degree angle, isolated on clean white background.
- Enforces per-vendor Workers AI daily allowance metering via `getVendorAiMeter(vendorId, 'CATEGORY_IMAGE')`.
- Uploads the generated image bytes to S3/R2 storage under a relative immutable key: `categories/${vendorId}/${slug}-${timestamp}.webp`.
- Returns `{ imageKey: string, imageUrl: string }` or `{ budgetRefused: AiBudgetCheck }`.

### R2. Single Category Generation Endpoint (`POST /api/admin/category-images/generate`)
- Authenticates caller with `requireVendorRole('ADMIN')`.
- Expects JSON body `{ categoryId: string, style?: 'photo' | '3d-icon' }`.
- Executes `runCategoryImagePipeline`.
- Updates `Category.imageKey` via `updateCategoryForVendor` with audit log / revalidation.
- Responds with HTTP 200 `{ ok: true, imageKey, imageUrl }`, HTTP 429 on budget refusal, or HTTP 400/404/500 on validation/generation failure.

### R3. Bulk Backfill Endpoint (`POST /api/admin/category-images/backfill`)
- Authenticates caller with `requireVendorRole('ADMIN')`.
- Finds all active categories for the vendor where `imageKey` is null or empty.
- Generates images sequentially, stopping gracefully if the vendor's AI meter refuses or error occurs.
- Responds with HTTP 200 `{ processed: number, total: number, message: string }`.

### R4. Category Image Manager Component (`components/staff/CategoryImageManager.tsx`)
- Placed inside `CategoryForm.tsx` (edit mode) or adjacent to the `imageKey` field.
- Renders:
  - Visual thumbnail preview of current category image/icon (using `imageUrl` or `composeCategoryImageUrl`).
  - Style selector toggle between "Product Photography" and "3D Rendered Icon".
  - "Auto-generate image" button with animated spinner during generation.
  - Clear error message banner if generation fails or budget is exhausted.
  - Auto-updates the form input `imageKey` on success and refreshes the preview.

### R5. Bulk Backfill Button (`components/staff/BackfillCategoryImagesButton.tsx`)
- Placed on `/staff/categories` above the category list.
- Displays the count of categories missing images (e.g. "Auto-generate 3 missing category images").
- Displays progress state and completion summary toast/banner.

### R6. Storage Purity & URL Resolution (ADR-003)
- Stores relative keys only in the database (e.g. `categories/a4ed.../bakery-1793...webp`).
- Composes full CDN URL using `CDN_BASE_URL` dynamically.
- Never writes full URLs to the database.

### R7. Security & Tenant Isolation (ADR-004)
- All database queries and storage keys strictly enforce `vendorId`.
- An admin of Vendor A cannot generate or overwrite category images belonging to Vendor B.

### R8. Zero Layout Shift & Fallback Parity
- Generated category images conform to 1:1 aspect ratio.
- Storefront displays (`DepartmentScroller`, `DepartmentGlyph`) load the generated image smoothly with fallback to semantic icon if missing.

### R9. Automated Verification
- Vitest unit tests verifying:
  - Role enforcement (refusal for non-admin).
  - Valid prompt generation for both 'photo' and '3d-icon' styles.
  - Budget refusal handling (HTTP 429).
  - Successful generation and `Category.imageKey` persistence.
  - UI component state transitions (loading, error, success).

### R10. Documentation Standards
- Update `docs/client-help-centre/category-image-standards.md` with operational guide for staff to generate and preview category imagery.
