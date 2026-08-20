# P8 — Smart Product Image Generation (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

No front-matter — like `requirements.md` and `validation.md` this is slice-local, not a KMS
artifact, and it does not get an `ARTIFACT_INDEX.md` entry.

## What changed and why
- **Schema**: Added `imageNeedsReview Boolean @default(false)` to `Product` model.
- **Config**: Added `aiSchema` to `lib/config.ts` to fetch Cloudflare credentials.
- **Service Layer**: Created `ProductMetadataService` (Open Food Facts API) and `ImageGenerationService` (Cloudflare Workers AI flux-1-schnell).
- **Pipeline**: Created `runProductImagePipeline` in `lib/product-image-pipeline.ts` to orchestrate metadata fallback, image generation, and uploading the blob to the existing StorageService via `putObject`.
- **API Routes**:
  - `POST /api/admin/product-images/generate`: Invokes the pipeline for a single product and inserts the image and review flag via a transaction.
  - `POST /api/admin/jobs/backfill-images`: Queries for products missing images and processes them in a loop.
- **UI**: Added a "✨ Auto-Generate Image" button in `ProductImageManager.tsx` that calls the generate endpoint and revalidates the page on success.
- **Staff List UI**: Displayed an "Image Needs Review" orange badge in the staff product list by passing the field down through `listProductsForAdmin`.

## Decisions taken during the build
- The "Auto-Generate Image" action on the client hits the Next.js API route instead of a Server Action because we needed to keep the REST-like response semantics that wrap both AI generation and database writes.
- We used `fetch` with raw blobs for AI API since it returns raw image buffer without base64 wrapper when `response_format` isn't requested.
- `quickUpdateInventory` wasn't explicitly changed but the vendor-scoping test caught a missing `vendorId` in `saveGeneratedProductImage`, which was promptly addressed to satisfy strict tenant RLS.

## Deviations from the spec
- None. The feature strictly adheres to the serverless fallback flow (External DB -> AI Gen) and writes to R2 bucket natively.

## Known-shaky areas
- **Open Food Facts Rate Limits**: The pipeline assumes stable uptime. If OFF limits requests, the text-fallback might silently fail and default straight to AI.
- **Cloudflare Token**: Requires `CLOUDFLARE_API_TOKEN` to be seeded properly in preview/staging, or the pipeline throws.
