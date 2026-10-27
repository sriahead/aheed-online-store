# Requirements: Category Asset Management, Dedicated Icon Gallery & Realistic System Icons

Tracking Issue: [#1285](https://github.com/sriahead/aheed-online-store/issues/1285)  
Slice: `specs/2026-10-27-category-asset-gallery-and-realistic-icons/`

## Context & Motivation

Following the implementation of realistic product photography for categories (issue #1278) and AI category image generation (issue #1283), operators require full control over category imagery:
1. Operators need to generate multiple candidate images for a category, review them side by side, select the preferred active asset, and delete unwanted images.
2. Store administrators require a dedicated Icon & Asset Gallery view in the staff panel (`/staff/icons`) displaying all generated category and UI assets across the platform, with preview, selection, direct generation, and deletion.
3. System touchpoint icons (header delivery pill, Shop, Quick Shop, user profile, role switcher dropdown, trust cards, and floating cart) must match the realistic commercial grocery photography aesthetic of the category scroller, replacing stylized or cartoonish renders.

---

## Functional Requirements

### R1 — CategoryAsset Schema & Persistence
- A new `CategoryAsset` table must be defined in Postgres via Prisma:
  - `id`: UUID primary key
  - `vendorId`: Foreign key to `Vendor(id)` with `onDelete: Cascade`
  - `categoryId`: Nullable foreign key to `Category(id)` with `onDelete: SetNull`
  - `slot`: Nullable string representing system icon slot (e.g., `"delivery-van"`, `"storefront"`, `"quick-shop"`, `"user-profile"`, `"cart-floating"`, `"secure-checkout"`, `"order-updates"`, `"view-shopper"`, `"view-staff"`, `"view-admin"`)
  - `storageKey`: Non-null string storing the relative R2 object storage key
  - `style`: String storing visual style preset (`"photo"` or `"3d-icon"`)
  - `isSelected`: Boolean flag indicating if this asset is currently assigned as active
  - `createdAt`: Timestamp with default `now()`
- Hand-authored migration with safe rollback and non-destructive DDL.

### R2 — In-Category Multi-Asset Review, Selection & Deletion
- In `CategoryForm.tsx` / `CategoryImageManager.tsx`:
  - When generating an image, the new asset is persisted as a `CategoryAsset` row and stored in R2.
  - The manager displays a responsive gallery of all generated candidate assets for that category.
  - Each asset thumbnail displays:
    - Image preview rendered via `ImageWithFallback`
    - Visual badge indicating whether it is currently selected/active
    - "Select as Active" button (updates `Category.imageKey` and marks `isSelected: true`)
    - "Delete" button with confirmation prompt
- Deleting an asset removes its object from R2 via `storage.deleteObject()` and removes the database record. If the deleted asset was selected, `Category.imageKey` is safely cleared or updated.

### R3 — Dedicated Staff Icon & Asset Gallery (`/staff/icons`)
- A dedicated page at `/staff/icons` protected by `requireVendorRole("STAFF", "ADMIN")`.
- Sits in staff navigation alongside Catalogue and Storefront settings.
- Features:
  - Filter tabs: **All Assets**, **Categories**, and **System Icons**.
  - Search/filter by category name or system icon slot name.
  - Responsive asset grid with clean card layout, asset style tags, dimensions, and timestamps.
  - **Preview:** Clicking an asset opens a high-resolution preview dialog with metadata.
  - **Select / Assign:** Assigns the asset to its category or system slot.
  - **Delete:** Permanently deletes the asset from storage and database.
  - **Generate:** Quick trigger to generate a new asset for any category or system icon slot.

### R4 — Realistic System Touchpoint Icons
- Provide realistic, photorealistic commercial assets matching the category photography standard for the touchpoints highlighted in operator feedback:
  1. `delivery-van`: Realistic UK refrigerated grocery delivery van (white and green livery)
  2. `storefront`: Realistic supermarket exterior entrance with glass storefront
  3. `quick-shop`: Realistic grocery basket filled with fresh fruits and daily essentials
  4. `user-profile`: Professional, photorealistic customer avatar portrait
  5. `cart-floating`: Authentic chrome wire grocery shopping trolley laden with fresh produce
  6. `secure-checkout`: Realistic metallic security shield with padlock
  7. `order-updates`: Realistic golden notification bell with delivery envelope
  8. `view-shopper`, `view-staff`, `view-admin`: Realistic badges for role switcher dropdown
- Delivered in 512x512 high-resolution WebP and PNG formats with clean transparency under `public/images/icons-3d/` and registered in `ICON_3D_IMAGE_ASSETS`.

### R5 — API Endpoints
- `POST /api/admin/category-images/generate`: Enhanced to record each generated asset in `CategoryAsset` and return the complete asset record.
- `GET /api/admin/category-images/assets`: Fetches all `CategoryAsset` rows for the authenticated vendor, with optional `categoryId` or `slot` filtering.
- `POST /api/admin/category-images/select`: Sets an asset as the active selection for its category or system slot.
- `DELETE /api/admin/category-images/assets`: Deletes an asset by `id`, invoking `storage.deleteObject()` and removing the row.

### R6 — Quotas, Resilience & Fallback
- All AI generation calls must be checked and metered against the vendor's daily AI allowance (`options.aiMeter.check()`).
- Deleting an asset must be idempotent: storage deletion errors on already-deleted keys must not block database cleanup.
- All image rendering must pass through `ImageWithFallback` with graceful vector fallbacks.

### R7 — Verification & Documentation
- Comprehensive automated tests in `tests/category-asset-gallery.test.ts`.
- Update KMS standards in `docs/client-help-centre/category-image-standards.md` and `docs/client-help-centre/icon-and-visual-asset-standards.md`.
- Full preclear verification via `npm run sdd:preclear`.
