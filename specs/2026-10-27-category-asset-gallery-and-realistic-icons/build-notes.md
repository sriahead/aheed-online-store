# Category Asset Management, Dedicated Icon Gallery & Realistic System Icons — Build Notes

Tracking Issue: [#1285](https://github.com/sriahead/aheed-online-store/issues/1285)  
Branch: `feature/category-asset-gallery-and-realistic-icons`  

## What changed and why

1. **`prisma/schema.prisma` & Hand-Authored Migration**
   - Added `CategoryAsset` model to track candidate images for categories and system UI icon slots.
   - Tied to `Vendor` (`onDelete: Cascade`) and nullable `Category` (`onDelete: SetNull`).
   - Carries `storageKey`, `style` (`photo` | `3d-icon`), `isSelected`, `slot`, and `createdAt`.
   - Hand-authored migration `prisma/migrations/20261027080000_category_and_system_assets/migration.sql` following CLAUDE.md strict DDL conventions without schema drift.
   - Includes data backfill statement linking all existing categories with `imageKey` into `CategoryAsset` as selected candidates.

2. **`lib/repositories/category-assets.ts`**
   - Implements `listCategoryAssets`, `getCategoryAssetById`, `createCategoryAsset`, `selectCategoryAsset`, and `deleteCategoryAsset`.
   - Strictly conforms to `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts`: takes `prisma` or `prismaWs` and `vendorId` as explicit parameters, reads no request context.
   - Operations using `updateMany` use `prismaWs` to adhere to isolate runtime constraints.
   - Deleting an active asset gracefully promotes the next candidate or clears the active slot.

3. **API Endpoints**
   - `GET /api/admin/category-images/assets`: Lists assets for authenticated vendor with optional `categoryId`, `slot`, and `style` filtering. Enriches entries with public URLs.
   - `DELETE /api/admin/category-images/assets`: Deletes asset from database and R2 object storage via `storage.deleteObject`.
   - `POST /api/admin/category-images/select`: Activates target candidate asset, deactivates other candidates, and updates `Category.imageKey`.
   - `POST /api/admin/category-images/generate`: Enhanced to support both category and system icon slot generation.

4. **UI Components & Centralized Icon Gallery**
   - `components/staff/CategoryImageManager.tsx`: Upgraded with candidate asset gallery, style badges, active indicator, "Select as Active" button, and confirmation-guarded "Delete" button.
   - `components/staff/IconGalleryClient.tsx` & `app/(admin)/staff/icons/page.tsx`: Standalone staff admin view for multi-slot asset inspection, search filtering, high-resolution modal preview, activation, and one-click generation.
   - Registered `/staff/icons` in `components/staff/nav-items.ts` and documented all 7 required sections in `docs/staff-playbook/staff-tabs-guide.md`, passing `tests/operator-doc-coverage.test.ts` and `tests/staff-nav-parity.test.ts`.

5. **Realistic System Icon Assets**
   - Generated and processed ultra-realistic commercial assets for the 10 touchpoints requested by the operator:
     1. `delivery-van`: UK refrigerated grocery van in crisp white and green livery
     2. `storefront`: Modern British supermarket exterior facade with glass doors and fruit displays
     3. `quick-shop`: Wire shopping basket loaded with fresh groceries and golden lightning badge
     4. `user-profile`: Professional smiling customer avatar portrait
     5. `cart-add`: Heavy chrome grocery shopping trolley filled with fresh vegetables and bakery goods
     6. `secure-checkout`: Brushed titanium security shield with brass padlock
     7. `order-updates`: Golden notification bell with delivery envelope
     8. `view-shopper`: Craft paper grocery bag filled with fresh produce
     9. `view-staff`: Modern supermarket cashier POS checkout terminal with scanner
     10. `view-admin`: Polished platinum security badge with administrative crest and key
   - Exported as 512x512 transparent WebP and PNG assets under `public/images/icons-3d/`.
   - Registered in `components/icons/Icon3D.tsx` and wired into `LocationControl.tsx` and `ViewSwitcher.tsx`.

6. **Automated Testing & Quality Gates**
   - Created `tests/category-asset-gallery.test.ts` (10 tests, 100% green).
   - Verified `tests/category-image-generation.test.ts` (11 tests, 100% green).
   - Verified `tests/operator-doc-coverage.test.ts` and `tests/staff-nav-parity.test.ts` (149 tests, 100% green).
   - Verified `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` (4 tests, 100% green).

## Decisions taken during the build

- **Facade in `lib/category-assets-service.ts`:** To respect ADR-004 slice 2 (`no-restricted-imports` forbidding `@/lib/db` in `app/`), we placed the prisma-injecting facade in `lib/category-assets-service.ts` while keeping `lib/repositories/category-assets.ts` completely pure and decoupled.
- **Graceful Deletion Fallback:** When an active primary asset is deleted from a category, the repository automatically queries the next most recent candidate in `CategoryAsset` and promotes it to active (`isSelected: true` and `Category.imageKey` updated). If no candidates remain, `imageKey` is safely cleared to null.
- **Idempotent Storage Deletion:** `DELETE /api/admin/category-images/assets` wraps R2 `storage.deleteObject()` in a try/catch warning log so that if a storage object was already pruned externally, the database record cleanup still succeeds.

## Deviations from the spec

None. All functional requirements (R1–R7) from `specs/2026-10-27-category-asset-gallery-and-realistic-icons/requirements.md` were implemented as specified.

## Known-shaky areas

None. All 10 repository/API unit tests, 11 category image generation tests, 149 navigation and operator documentation coverage tests, and repository purity tests pass 100% green.
