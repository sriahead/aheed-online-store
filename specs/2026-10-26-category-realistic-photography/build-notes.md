# Realistic Product Photography for Categories (build notes)

Addresses issue `#1278`. Base branch: `staging`.

## Summary of Changes

1. **Database Schema & Additive Migration:**
   - Updated `prisma/schema.prisma` adding `imageKey String?` to `model Category` per ADR-003 (storing relative asset keys, never full URLs).
   - Created additive migration `prisma/migrations/20261026150000_category_image_key/migration.sql` with backfill for all existing seeded categories across Aheed Food Centre and SriMart.
   - Regenerated Prisma WASM client (`@prisma/client/wasm` and `@aheed/reference-client/wasm`).
   - Updated `prisma/seed.ts` to populate canonical category photography keys.

2. **Studio Product Photography Assets:**
   - Created 15 commercial studio product photographs under `public/images/categories/<slug>.jpg` (512x512 square, high-quality bicubic, ~12KB–51KB each) matching UK supermarket retail standards (Tesco reference model) across all 15 active departments:
     - `fruit-veg.jpg`, `bakery.jpg`, `dairy-eggs.jpg`, `halal-meat.jpg`, `groceries.jpg`, `beverages.jpg`, `snacks.jpg`, `household.jpg`, `frozen-foods.jpg`, `international.jpg`, `health-beauty.jpg`, `baby-kids.jpg`, `pet-supplies.jpg`, `sri-electronics.jpg`, `sri-home.jpg`.

3. **Repositories & Service Layer:**
   - Added pure helper `composeCategoryImageUrl(imageKey, slug, cdnBaseUrl)` in `lib/repositories/categories.ts`.
   - Updated `CategorySummary`, `CategoryWithChildren`, `StorefrontCategoryNode`, `AdminCategoryDetail`, and `CategoryWriteInput` interfaces.
   - Updated `listTopLevelCategories`, `listCategoryTreeForStorefront`, `suggestCategories`, `getCategoryBySlug`, `getCategoryForAdmin`, `createCategoryForVendor`, `updateCategoryForVendor` to select and persist `imageKey` and compose `imageUrl`.
   - Injected `CDN_BASE_URL` in `lib/categories-service.ts`.
   - Updated `app/api/search/suggest/route.ts` and `lib/catalogue-form.ts` to return and accept `imageKey`/`imageUrl`.

4. **Frontend Surfaces:**
   - `components/layout/DepartmentScroller.tsx`: Renders photographic category card with clean subtle framing, eager loading for top 6 items, lazy loading for remainder with async decoding, and graceful fallback to semantic icon on error or missing image.
   - `components/layout/DepartmentGlyph.tsx`: Renders photograph when `imageUrl` is supplied, preserving fallback to `departmentIllustration(slug)` and semantic icon glyph.
   - `components/staff/CategoryForm.tsx`: Added form control for `imageKey` with helper text.

5. **KMS Standards & Onboarding Documentation:**
   - Authored `docs/client-help-centre/category-image-standards.md` detailing image specifications (512x512, square, WebP/JPEG <80KB, seamless white/transparent background, 80% fill) and onboarding instructions for store operators.
