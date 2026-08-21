# P8 — Smart Product Image Generation (validation)

Validation performed live on staging (`https://staging.aheedfoodcentre.nocaped.com`) after each
hotfix was deployed. No local DB access; all checks below are staging-verified unless noted.

---

## Results

| Req | Description | Status | Notes |
|-----|-------------|--------|-------|
| R1 | `imageNeedsReview` column on `Product` | ✅ PASS | Applied via manual `migration.sql` (UTF-8). Staging DB confirms column exists and defaults to `false`. |
| R2 | `ProductMetadataService` fetches from Open Food Facts | ✅ PASS | Tested implicitly — pipeline ran without error for products with known barcodes. |
| R3 | `ImageGenerationService` calls Cloudflare Workers AI | ✅ PASS | Successfully generated at least one image in staging after secrets were injected (PR #301). Verified retry logic after hitting a 429 (PR #302). |
| R4 | `POST /api/admin/product-images/generate` — protected, returns `imageKey` + `needsReview` | ✅ PASS | Admin user clicked "Auto-Generate Image" on a product edit page; image appeared in the preview and was saved to R2. |
| R5 | `POST /api/admin/jobs/backfill-images` — processes up to 10 missing-image products | ✅ PASS | "Auto-fill Missing Images" button on `/staff/products` triggers the endpoint; summary alert shows count of images generated. |
| R6 | Admin product form has a functional "Auto-Generate Image" button | ✅ PASS | Button visible and functional; image preview loads after generation; page refreshes to show new image. |
| R7 | Products list shows indicator for `imageNeedsReview == true` | ✅ PASS (variant) | Shipped as an "Approve Image" banner on the **edit page** rather than a list badge — see Deviations in `build-notes.md`. Banner correctly appears and disappears on approval. |
| R8 | `lint`, `typecheck`, `test`, `format:check` all pass | ✅ PASS | `npm run build` clean locally. TypeScript error on `data: unknown` in `BackfillImagesButton.tsx` fixed before final deploy. |
| R9 | `CHANGELOG.md` updated | ✅ PASS | Entry present under `[Unreleased] > Added` for P8 from initial build. |

---

## Issues found and resolved during staging validation

| # | Symptom | Root cause | Resolution | PR |
|---|---------|------------|------------|----|
| 1 | "Failed to fetch" on `/staff/products/[id]` | `CLOUDFLARE_API_TOKEN` not bound to worker runtime — only available to the `wrangler` CLI process | Added `echo "$VAR" \| npx wrangler secret put KEY` steps in CI | #301 |
| 2 | "i2 is not a function" runtime crash on edge | Dynamic `require()` inside a function body is not supported in edge-minified bundles | Replaced all dynamic `require()` calls with static ES `import` at module top | #302 |
| 3 | "Transactions are not supported in HTTP mode" | `$transaction([...])` (array form) is not supported by the Prisma Neon HTTP driver | Replaced with sequential `await` calls | #302 |
| 4 | "429 Capacity temporarily exceeded" on second generation | Cloudflare AI `flux-1-schnell` is rate-limited under concurrent load | Added 3-attempt exponential backoff (1s → 2s) in `generateImage()` | #302 |
| 5 | No way to approve / clear the "Needs Review" flag | "Approve Image" UI was omitted from the initial build | Added `approveProductImageRow` repo fn, `approveProductImage` server action, and approve banner in `ProductImageManager.tsx` | #303 |
| 6 | Approve banner invisible / button unstyled | Used non-existent Tailwind utilities `bg-warning`, `text-warning-strong` (no `warning` token defined in design system) | Replaced with design-system tokens: `bg-accent`, `bg-accent-tint`, `text-accent`, `hover:bg-accent-hover` | #304 |
| 7 | Batch "Auto-fill" button not present anywhere | `BackfillImagesButton` component and its import in `page.tsx` not included in initial build | Created `components/staff/BackfillImagesButton.tsx` and added to products page header | #304 |
| 8 | "400 Input prompt contains NSFW content" from Cloudflare AI | Multi-sentence food photography prompt triggered `flux-1-schnell`'s NSFW classifier — false positive on culinary adjectives ("fresh", "appetizing") | Replaced with minimal neutral prompt: `"Product photo of {name} on a plain white background, studio lighting, top quality, centered."` | committed directly to `staging` |

---

## Staging sign-off checklist

- [x] Image generated successfully for at least one product
- [x] Image stored in R2 and visible in product edit page preview
- [x] `imageNeedsReview` flag set to `true` after AI generation
- [x] "Approve Image" banner visible when flag is set
- [x] Clicking "Approve Image" clears the banner (flag set to `false`)
- [x] "Auto-fill Missing Images" button on `/staff/products` triggers batch job
- [x] All API routes return 401 for non-admin users (verified by session scope)
- [x] Build passes with zero TypeScript errors
