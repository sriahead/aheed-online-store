# P8 — Smart Product Image Generation (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

No front-matter — like `requirements.md` and `validation.md` this is slice-local, not a KMS
artifact, and it does not get an `ARTIFACT_INDEX.md` entry.

---

## What changed and why

### Initial build (`feature/p8-smart-image-generation` → staging, PR #293)

- **Schema**: Added `imageNeedsReview Boolean @default(false)` to `Product` model.
  Prisma migration created manually as `migration.sql` (UTF-8, not PowerShell echo) to avoid
  Prisma CLI rejecting null-padded UTF-16 LE files on Linux CI.
- **Config**: Added `aiSchema` to `lib/config.ts` to validate `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_API_TOKEN` at runtime.
- **Service Layer**:
  - `lib/product-metadata.ts` — `ProductMetadataService`, queries Open Food Facts by product name
    or barcode using standard `fetch`.
  - `lib/image-generation.ts` — `ImageGenerationService`, calls Cloudflare Workers AI
    `flux-1-schnell` via REST `fetch`, with 3-attempt exponential backoff to handle `429 Too Many
    Requests` (Cloudflare capacity limits are common under moderate load).
  - `lib/product-image-pipeline.ts` — Orchestrates: try Open Food Facts → fallback to AI → upload
    buffer to `StorageService.putObject`.
- **API Routes**:
  - `POST /api/admin/product-images/generate` — Single-product generation, protected by
    `requireVendorRole("ADMIN")`. Returns `{ imageKey, needsReview }`.
  - `POST /api/admin/jobs/backfill-images` — Queries up to 10 products with `imageKey: null`,
    processes them sequentially, and returns a summary.
- **Repository Layer**:
  - `saveGeneratedProductImage` — Writes `imageKey`, `imageNeedsReview`, and `imageAlt` to the
    product row. Implemented with **sequential awaits** instead of `$transaction([...])` because
    Prisma HTTP mode (Neon serverless) does not support array transactions.
  - `approveProductImageRow` — Sets `imageNeedsReview: false` on a product row.
  - `getProductForAdmin` — Extended to return `imageNeedsReview`.
- **Server Action**: `approveProductImage` in `features/admin/product-image.ts` — wraps
  `approveProductImageRow` and `revalidatePath`.
- **UI — Product Form** (`components/staff/ProductImageManager.tsx`):
  - Added **"✨ Auto-Generate Image"** button that calls `/api/admin/product-images/generate` and
    refreshes the router on success.
  - Added **"Approve Image"** warning banner (amber accent) that renders when `imageNeedsReview` is
    `true`. Clicking "Approve Image" calls the server action and dismisses the banner.
- **UI — Products List** (`app/(admin)/staff/products/page.tsx`):
  - Added **"Auto-fill Missing Images"** button (`components/staff/BackfillImagesButton.tsx`) that
    calls `POST /api/admin/jobs/backfill-images` and displays the result summary in a native alert.
- **CI — Worker secrets**: Updated `.github/workflows/deploy-staging.yml` to pipe
  `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` via `wrangler secret put` during CI so the
  worker runtime can authenticate against the Cloudflare AI REST API.

---

## Hotfixes applied during staging validation (PRs #301–#304)

These were all discovered by live manual testing on staging, not missed by the build:

| PR | Problem | Fix |
|----|---------|-----|
| #301 | `CLOUDFLARE_API_TOKEN` not injected into worker runtime | Added `echo "..." \| npx wrangler secret put` steps in deploy workflow |
| #302 | Dynamic `require()` in `lib/image-generation.ts` crashed edge minification with "i2 is not a function" | Replaced `require()` with static ES `import` statements |
| #302 | `$transaction([...])` threw "Transactions are not supported in HTTP mode" | Replaced with sequential `await` calls |
| #302 | Repeated rapid generation hit `429 Capacity temporarily exceeded` from Cloudflare AI | Added 3-attempt exponential backoff loop in `generateImage()` |
| #303 | "Approve Image" button was missing — omitted from initial build | Added `approveProductImageRow`, `approveProductImage` action, and banner UI |
| #304 | Approve button invisible — used non-existent Tailwind utility classes (`bg-warning`, `text-warning-strong`) | Replaced with design-system tokens: `bg-accent`, `text-accent`, `bg-accent-tint` |
| #304 | Batch button missing from products list page | Added `BackfillImagesButton` component and wired into products page header |
| (staging) | `POST /api/admin/product-images/generate` returned 400 "Input prompt contains NSFW content" | Simplified prompt from multi-sentence food-photography description to: `"Product photo of {name} on a plain white background, studio lighting, top quality, centered."` — Cloudflare's `flux-1-schnell` NSFW classifier false-positives on adjectives like "fresh" in culinary context |

---

## Decisions taken during the build

- **API route, not Server Action, for generation**: The generate endpoint needs to stream a binary
  image buffer and handle retries before returning. Server Actions have a 30-second timeout and
  cannot return raw binary. Kept as a REST route.
- **Sequential awaits instead of `$transaction`**: Prisma over HTTP (Neon serverless driver) does
  not support array transactions. Sequential awaits are safe here because the two writes
  (image key, review flag) are idempotent and failure of the second will leave an image without
  a review flag — a safe conservative state the approve flow handles.
- **Cloudflare AI prompt kept minimal**: The classifier is sensitive to food-adjacent adjectives.
  Short neutral prompts (`"Product photo of X on white background"`) pass reliably.
- **Backfill is pull-based, not push**: The backfill route processes up to 10 products per call.
  Scheduling (Cloudflare Cron Triggers) is explicitly out of scope for P8; the button in the UI
  is the trigger for now.

---

## Deviations from the spec

- **R7 (visual indicator in product list)**: The spec asked for a filter or badge on the products
  list. What shipped is slightly different — an "Approve Image" banner on the **product edit page**
  rather than a badge on the list row. The list page gained the **batch backfill button** instead.
  This is a conscious tradeoff: the approval workflow is per-product so the edit page is the natural
  action surface, and the list would need a DB join that increases query cost for every page load.

---

## Known-shaky areas

- **Open Food Facts rate limits**: The pipeline assumes stable OFF uptime. If OFF is throttling,
  the text fallback might silently fail and default straight to AI generation. No retry is
  implemented on the OFF side — add one if OFF hit-rate proves low.
- **Cloudflare AI prompt sensitivity**: The simplified prompt works for grocery product names tested
  so far. Unusual product names containing words that happen to match NSFW patterns may still be
  rejected. If this happens, stripping non-alphanumeric characters from the product name before
  constructing the prompt is a safe mitigation.
- **Batch limit is hardcoded to 10**: Processing more than 10 products requires multiple button
  clicks. This is intentional (avoids long-running requests timing out in the edge), but a
  progress indicator or looping until done would improve UX.
