# P8 — Smart Product Image Generation (requirements)

Automated image fetching (Open Food Facts) with AI fallback (Cloudflare REST) to eliminate the manual product photography bottleneck.

R1. The `Product` model in Prisma has an `imageNeedsReview` Boolean field defaulting to `false`.
R2. A `ProductMetadataService` exists that can fetch product images from the Open Food Facts API using standard `fetch`.
R3. An `ImageGenerationService` exists that calls the Cloudflare Workers AI REST API (`@cf/black-forest-labs/flux-1-schnell` or similar) via standard `fetch`, using `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` environment variables.
R4. A `POST /api/admin/product-images/generate` endpoint exists, protected by `requireVendorRole("ADMIN")`, which takes a `productName` and optional `barcode`, runs the pipeline, uploads to `StorageService`, and returns the `imageKey` and a `needsReview` boolean.
R5. A `POST /api/admin/jobs/backfill-images` endpoint exists, which queries up to 10 products with `imageKey: null`, processes them, updates the products, sets `imageNeedsReview: true` if the AI was used, and returns a summary.
R6. The Admin Panel product form (`app/(admin)/staff/products/...`) has a functional "Auto-Generate Image" UI element that calls the generation endpoint and displays the preview.
R7. The Admin Panel products list (`app/(admin)/staff/products/page.tsx`) has a filter or visual indicator to show products where `imageNeedsReview == true`.
R8. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
R9. `CHANGELOG.md` updated (Gate 4).
