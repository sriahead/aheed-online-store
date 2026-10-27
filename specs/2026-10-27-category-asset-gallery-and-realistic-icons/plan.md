---
id: category-asset-gallery-and-realistic-icons-plan
title: "Category Asset Management, Dedicated Icon Gallery & Realistic System Icons (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-27
visibility: internal
summary: Enable operators to generate, review, select, and delete assets within categories, launch a dedicated Icon & Asset Gallery at /staff/icons, and deliver realistic commercial system icons across all touchpoints.
tags: [spec, categories, assets, gallery, icons, visual-design, staff-admin]
---

# Engineering Plan: Category Asset Management, Dedicated Icon Gallery & Realistic System Icons

**Tracking issue:** `#1285`  
**Slice:** `specs/2026-10-27-category-asset-gallery-and-realistic-icons/`  
**Base branch:** `staging`  
**Feature branch:** `feature/category-asset-gallery-and-realistic-icons`

---

## 1. Architecture & Strategy

This feature elevates category and icon asset management to a full creative workflow:
- **Relational Asset Ledger:** `CategoryAsset` tracks all candidate imagery generated for categories and system icon slots.
- **In-Form Asset Picker & Gallery:** `CategoryImageManager.tsx` allows operators to review generated candidates, preview them, switch active selections, and delete obsolete variations.
- **Dedicated Centralized Gallery (`/staff/icons`):** A standalone staff admin view providing an overview of all visual assets, with filtering, modal inspection, and batch cleanup.
- **Visual Realism Standard:** Upgrade system icons (header delivery pill, shop, quick shop, user profile, role view switcher, trust cards, and floating cart) from stylized vector/3D renders to photorealistic commercial assets matching the category photography standard.

```
+-------------------------------------------------------------------------------------------------+
| Staff Panel Interfaces                                                                          |
| 1. /staff/categories/[id] -> CategoryImageManager (Generate, Review, Select, Delete)            |
| 2. /staff/icons          -> IconGalleryClient   (Unified multi-slot library & preview modal)   |
+-------------------------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------------------------+
| Admin API Endpoints                                                                             |
| - POST   /api/admin/category-images/generate  (Generates via Workers AI, saves CategoryAsset)   |
| - GET    /api/admin/category-images/assets    (Lists assets filtered by category or slot)       |
| - POST   /api/admin/category-images/select    (Sets active asset for category or slot)          |
| - DELETE /api/admin/category-images/assets    (Deletes R2 object + CategoryAsset record)        |
+-------------------------------------------------------------------------------------------------+
                                       |
               +-----------------------+-----------------------+
               |                                               |
               v                                               v
+-------------------------------------+         +-------------------------------------+
| Neon PostgreSQL (Prisma)            |         | Cloudflare R2 Storage (S3 API)      |
| - CategoryAsset table               |         | - storage.putObject()               |
| - Category.imageKey update          |         | - storage.deleteObject()            |
+-------------------------------------+         +-------------------------------------+
```

---

## 2. Implementation Steps

### Step 1: Database Migration & Schema
- Update `prisma/schema.prisma` with `CategoryAsset` model and relations.
- Hand-author migration `prisma/migrations/20261027080000_category_and_system_assets/migration.sql`.
- Generate Prisma client WASM (`npx prisma generate`).

### Step 2: Repository & Service Functions
- In `lib/repositories/category-assets.ts`:
  - `listCategoryAssets(vendorId, options)`
  - `createCategoryAsset(vendorId, data)`
  - `selectCategoryAsset(vendorId, assetId)`
  - `deleteCategoryAsset(vendorId, assetId)`
- In `lib/category-image-pipeline.ts`:
  - Update `runCategoryImagePipeline` to persist to `CategoryAsset` and mark as selected.

### Step 3: API Endpoints
- Create `GET /api/admin/category-images/assets` and `DELETE /api/admin/category-images/assets`.
- Create `POST /api/admin/category-images/select`.
- Update `POST /api/admin/category-images/generate` to return the new asset record.

### Step 4: UI Components
- Upgrade `CategoryImageManager.tsx`:
  - Show candidate gallery with thumbnails, active checkmark badges, "Select as Active", and "Delete" buttons.
- Create `components/staff/IconGalleryClient.tsx` for `/staff/icons`:
  - Category and system slot filtering.
  - High-res preview modal.
  - Selection and deletion triggers with instant feedback.
- Create `app/(admin)/staff/icons/page.tsx`.

### Step 5: Realistic System Icon Assets
- Generate realistic, high-fidelity commercial photography / 3D rendered assets for:
  - `delivery-van`, `storefront`, `quick-shop`, `user-profile`, `cart-floating`, `secure-checkout`, `order-updates`, `view-shopper`, `view-staff`, `view-admin`.
- Place optimized WebP and PNG assets in `public/images/icons-3d/` and update `ICON_3D_IMAGE_ASSETS` in `components/icons/Icon3D.tsx`.

### Step 6: Automated Tests, KMS & Quality Verification
- Create `tests/category-asset-gallery.test.ts`.
- Update `docs/client-help-centre/category-image-standards.md` and rebuild KMS index.
- Validate `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run sdd:preclear`.
