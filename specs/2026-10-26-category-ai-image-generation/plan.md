# Engineering Plan: AI Image Generation for Category Icons & Departments

**Tracking issue:** `#1283`  
**Slice:** `specs/2026-10-26-category-ai-image-generation/`  
**Base branch:** `staging`  
**Feature branch:** `feature/category-ai-image-generation`  

---

## 1. Architecture & Strategy

This feature brings full parity between product catalogue image workflows and category icon/department image workflows.

```
+----------------------------------------------------------------------------------+
| Staff Admin Surface                                                              |
| - CategoryForm.tsx / CategoryImageManager.tsx ("Auto-generate image" button)     |
| - BackfillCategoryImagesButton.tsx ("Auto-generate missing category images")     |
+----------------------------------------------------------------------------------+
                                        | POST JSON
                                        v
+----------------------------------------------------------------------------------+
| API Endpoints                                                                    |
| - /api/admin/category-images/generate                                            |
| - /api/admin/category-images/backfill                                            |
+----------------------------------------------------------------------------------+
                                        |
                   +--------------------+--------------------+
                   |                                         |
                   v                                         v
+------------------------------------+    +------------------------------------+
| lib/category-image-pipeline.ts     |    | lib/ai-meter-service.ts            |
| - Build prompt (photo vs 3D icon)  |    | - Check & record Workers AI budget |
| - Call getImageGenerationService() |    +------------------------------------+
| - Upload to S3/R2 storage          |
| - Return relative key & full URL   |
+------------------------------------+
                   |
                   v
+----------------------------------------------------------------------------------+
| PostgreSQL / Neon Database (Prisma)                                              |
| - update Category.imageKey via updateCategoryForVendor()                         |
+----------------------------------------------------------------------------------+
```

---

## 2. Implementation Steps

### Step 1: Core Pipeline Helper (`lib/category-image-pipeline.ts`)
1. Create `lib/category-image-pipeline.ts` with `runCategoryImagePipeline`.
2. Construct standardized prompts based on style:
   - Photo: `Commercial studio grocery photography of fresh [name], appetizing presentation, isolated on pure white background, studio softbox lighting, high resolution, 1:1 square aspect ratio.`
   - 3D Icon: `3D rendered commercial app icon of [name], isolated on pure white background, smooth tactile clay and glossy materials, subtle specular highlights, soft ambient contact shadow, isometric 45 degree angle, clean retail aesthetic.`
3. Use existing `getImageGenerationService().generateImage(prompt)`.
4. Upload to S3/R2 via `getStorage().putObject(key, buffer, 'image/webp')`.

### Step 2: API Endpoints
1. Create `app/api/admin/category-images/generate/route.ts`:
   - Role guard `requireVendorRole('ADMIN')`.
   - Run pipeline and persist with `updateCategoryForVendor`.
   - Revalidate category paths.
2. Create `app/api/admin/category-images/backfill/route.ts`:
   - Role guard `requireVendorRole('ADMIN')`.
   - Iterate over categories missing `imageKey`.
   - Process up to 5 categories per invocation, respecting budget limits.

### Step 3: Frontend Components
1. Create `components/staff/CategoryImageManager.tsx`:
   - Thumbnail preview using `imageUrl`.
   - Style toggle (`photo` vs `3d-icon`).
   - "Auto-generate image" button with state indicator.
   - Synchronizes `imageKey` input with the parent form.
2. Integrate `CategoryImageManager` into `components/staff/CategoryForm.tsx`.
3. Create `components/staff/BackfillCategoryImagesButton.tsx` and place on `/staff/categories`.

### Step 4: Automated Testing
1. Author `tests/category-image-generation.test.ts` testing:
   - Endpoint authentication and vendor isolation.
   - Prompt construction.
   - Budget refusal propagation.
   - UI component rendering and interactions.

### Step 5: KMS Documentation
1. Update `docs/client-help-centre/category-image-standards.md` with the new in-app generation instructions.
2. Rebuild KMS index (`npm run kms:build-index`) and validate (`npm run kms:validate`).

### Step 6: SDD Verification & Pull Request
1. Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and Vitest test suite.
2. Update `CHANGELOG.md` under `## [Unreleased] -> ### Added`.
3. Check `npm run sdd:preclear`.
4. Open PR to `staging`, monitor CI, and merge.
