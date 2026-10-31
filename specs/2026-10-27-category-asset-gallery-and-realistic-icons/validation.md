# Validation Criteria: Category Asset Management, Dedicated Icon Gallery & Realistic System Icons

**Tracking issue:** `#1285`  
**Slice:** `specs/2026-10-27-category-asset-gallery-and-realistic-icons/`  
**Base branch:** `staging`  
**Feature branch:** `feature/category-asset-gallery-and-realistic-icons`  

---

## 1. Automated Test Criteria

### 1.1 CategoryAsset Schema & Repository
- `createCategoryAsset` writes a valid `CategoryAsset` record tied to `vendorId` and optional `categoryId` or `slot`.
- `listCategoryAssets` filters by `vendorId`, `categoryId`, and `slot`, ordering by `createdAt desc`.
- `selectCategoryAsset` sets `isSelected: true` on the targeted asset, sets `isSelected: false` on others for that category/slot, and updates `Category.imageKey` when `categoryId` is present.
- `deleteCategoryAsset` deletes the record, cascades or safely unlinks, returns the `storageKey`, and clears `Category.imageKey` if the deleted asset was the selected one.

### 1.2 Admin API Endpoints
- `GET /api/admin/category-images/assets`:
  - Returns 401 for unauthenticated requests.
  - Returns 403 for unauthorized roles.
  - Returns list of `CategoryAsset` items scoped strictly to the caller's `vendorId`.
  - Supports query parameters `categoryId` and `slot`.
- `POST /api/admin/category-images/select`:
  - Returns 400 if `assetId` is missing.
  - Returns 404 if `assetId` does not exist or belongs to another vendor.
  - Updates selection state and returns updated asset.
- `DELETE /api/admin/category-images/assets`:
  - Returns 400 if `assetId` is missing.
  - Returns 404 if `assetId` does not exist or belongs to another vendor.
  - Calls `storage.deleteObject` with the asset's `storageKey` and removes the database record.
- `POST /api/admin/category-images/generate`:
  - Generates the asset via Workers AI.
  - Creates a new `CategoryAsset` entry marked as `isSelected: true`.
  - Updates `Category.imageKey`.
  - Returns the newly created asset record in the JSON response.

### 1.3 UI Components & Navigation
- `CategoryImageManager`:
  - Displays existing assets in a responsive grid.
  - Highlights currently selected asset with a distinct badge.
  - Provides "Select as Active" and "Delete" actions with confirmation.
  - Updates smoothly after generating, selecting, or deleting an asset.
- `IconGalleryClient` & `/staff/icons`:
  - Loads assets on mount.
  - Tabs filter between All, Categories, and System Icons.
  - Preview modal displays full asset details, style, slot/category, and high-res image.
  - Delete and select actions function directly from the gallery.
  - Link to `/staff/icons` present in staff admin navigation.

---

## 2. Quality Gates

- `npm run typecheck` passes with zero errors.
- `npm run lint` passes with zero ESLint warnings or errors.
- `npm run format:check` passes with Prettier compliance.
- `npx vitest run tests/category-asset-gallery.test.ts` passes 100% green.
- `npm run kms:validate` and `npm run kms:build-index` pass without warnings.
- `npm run sdd:preclear` exits 0 before merge.
