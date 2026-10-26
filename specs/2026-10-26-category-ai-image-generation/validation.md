# Validation Criteria: AI Image Generation for Category Icons & Departments

**Tracking issue:** `#1283`  
**Slice:** `specs/2026-10-26-category-ai-image-generation/`  
**Base branch:** `staging`  
**Feature branch:** `feature/category-ai-image-generation`  

---

## 1. Test Criteria (Automated)

### 1.1 API Security & Vendor Scoping
- `POST /api/admin/category-images/generate` refuses unauthenticated callers with HTTP 401.
- Refuses non-admin roles (e.g. `STAFF` or `CUSTOMER`) with HTTP 403.
- Refuses if `categoryId` belongs to a different vendor (tenant isolation).
- Rejects requests missing required fields with HTTP 400.

### 1.2 Pipeline & Budget Metering
- Validates prompt construction for both `'photo'` and `'3d-icon'` modes.
- Propagates AI allowance budget exhaustion with HTTP 429 (`AiBudgetRefused`).
- Uploads image to S3/R2 storage with valid relative key under `categories/<vendorId>/`.
- Persists the new `imageKey` to the category record in PostgreSQL.

### 1.3 Backfill Endpoint
- `POST /api/admin/category-images/backfill` iterates over categories without images.
- Halts gracefully when AI budget is exhausted and returns detailed progress summary.

### 1.4 Frontend UI
- `CategoryImageManager` displays a live preview thumbnail of the category image.
- "Auto-generate image" button triggers generation and provides visual spinner feedback.
- Errors are displayed clearly in an accessible error banner.
- Form input for `imageKey` is kept synchronized.

---

## 2. Quality Gates

- `npm run typecheck` passes with zero errors.
- `npm run lint` passes with zero ESLint warnings or errors.
- `npm run format:check` passes with Prettier compliance.
- `npx vitest run tests/category-image-generation.test.ts` passes 100% green.
- `npm run kms:validate` and `npm run kms:build-index` pass without warnings.
- `npm run sdd:preclear` exits 0 before merge.
