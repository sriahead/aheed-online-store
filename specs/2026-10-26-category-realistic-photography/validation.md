# Validation Criteria: Realistic Product Photography for Categories

| Ref | Type | Verification Command / Step | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **R1** | Schema | `npx prisma validate` | Exits 0; `Category.imageKey` defined as nullable `String?` |
| **R2** | Migration | `Get-Content prisma/migrations/20261026150000_category_image_key/migration.sql` | Contains `ALTER TABLE "Category" ADD COLUMN "imageKey" TEXT;` and backfill updates |
| **R3** | Seed | `npm run db:generate` | Prisma client generates `@prisma/client/wasm` with `imageKey` |
| **R4** | Assets | `Get-ChildItem public/images/categories/*.webp` | 15 photographic WebP files present |
| **R5** | Optimization | File size check | All category images under 50 KB |
| **R6** | Types | `npm run typecheck` | CategorySummary and StorefrontCategoryNode have `imageKey` and `imageUrl` |
| **R7** | Repo | `npx vitest run tests/category-images.test.ts` | Exits 0; proves dynamic URL resolution and fallbacks |
| **R8** | Repo Purity | `npx vitest run tests/repository-purity.test.ts` | Exits 0 |
| **R9** | UI | Inspect `DepartmentScroller.tsx` | Renders `category.imageUrl` via `ImageWithFallback` |
| **R10** | Fallback | Unmapped category test | Degrades to semantic icon `categoryIconName` |
| **R11** | Staff | Inspect `CategoryForm.tsx` | Renders `imageKey` field |
| **R12** | KMS Docs | `npm run kms:validate` | Validates category image standards document |
| **R13** | KMS Index | `npm run kms:build-index` | Successfully updates index with new guide |
| **R14** | Full Gate | `npm run lint && npm run format:check && npm run typecheck && npm test` | All CI checks pass |
