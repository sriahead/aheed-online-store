# Product image integrity (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before you start

This slice writes objects into the **staging** R2 bucket (R5). Before running anything that
touches a live environment, confirm which database and bucket you are pointed at, per `CLAUDE.md`'s
config rules:

```
grep -oE '@ep-[a-z0-9-]+' .env .dev.vars secrets/staging.vars secrets/production.vars
grep -oE '^S3_BUCKET=.*' .env .dev.vars secrets/staging.vars
```

Expected on 2026-09-01: `.env` and `.dev.vars` both resolve to `ep-sparkling-paper-za3j7xza`
(bucket `aheed-images-dev`); `secrets/staging.vars` to `ep-empty-scene-zafjzeye` (bucket
`aheed-images-staging`); `secrets/production.vars` to `ep-young-glitter-zadlkttm`. If `.env` or
`.dev.vars` resolves to the staging or production host, **stop** — that is #119's failure mode and
every live row below would be measuring the wrong environment.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit         | `npx vitest run tests/product-image.test.ts` exits 0, including new cases asserting `isPlaceholderImageKey("products/cat-litter-5kg/main.svg") === true`, `isPlaceholderImageKey("products/gen-south-asian/main.svg") === true`, and `isPlaceholderImageKey(buildProductImageKey("p1")) === false`. |
| R2  | Integration  | `grep -n "putTracked\|existing >= count\|return;" prisma/seed.ts` — read the `seedGeneratedCatalogue` body and confirm the placeholder `putTracked` loop appears at a lower line number than the `if (existing >= count) { ... return; }` guard. Then run `npm run db:seed` against the dev branch (already holds 2,000 generated products, so the guard fires) and confirm its output reports placeholder uploads rather than only `skipping`. |
| R3  | Integration  | `npx tsx scripts/restore-placeholder-images.ts --env-file .env > restore-dev.txt 2>&1` then `cat restore-dev.txt`. Exits 0; prints the resolved DB host and bucket before acting; prints a distinct-key count matching `SELECT COUNT(DISTINCT "storageKey") FROM "ProductImage" WHERE "storageKey" LIKE '%/main.svg'` on that branch. **Do not pipe this through `head`** — per `CLAUDE.md`, closing the pipe early can kill the writer before its own exit path runs. |
| R4  | Integration  | Run the exact R3 command a second time into `restore-dev-2.txt`; `diff <(grep -o 'uploaded [0-9]* distinct' restore-dev.txt) <(grep -o 'uploaded [0-9]* distinct' restore-dev-2.txt)` prints nothing and both runs exit 0. |
| R5  | E2E          | `npx tsx scripts/restore-placeholder-images.ts --env-file secrets/staging.vars` exits 0 (confirm its printed host is `ep-empty-scene-zafjzeye` and bucket `aheed-images-staging` **before** letting it proceed). Then for each distinct placeholder key it reports, `curl -s -o /dev/null -w "%{http_code}"` against `https://images.staging.aheedfoodcentre.nocaped.com/<key>` returns `200`. Spot-check at minimum `products/gen-south-asian/main.svg` and `products/cat-litter-5kg/main.svg`, both of which return 404 today. |
| R6  | Unit         | `npx vitest run tests/product-card-image.test.tsx` exits 0. Its `// @vitest-environment jsdom` cases render `ProductImage` (the client boundary `ProductCard` now delegates its `<img>` to), fire an `error` event on the rendered `<img>` via `fireEvent.error`, and assert the `<img>` is gone and an element carrying `bg-surface-muted` is present. Also confirm `components/product/ProductCard.tsx` renders `<ProductImage …>` rather than a bare `<img>` for `product.primaryImage`. |
| R7  | Integration  | `npx tsx scripts/verify-repository-injection.ts > verify.txt 2>&1` exits 0 (it refuses to run against staging/production by design), and `verify.txt` reports the new `getProductsWithoutImages` case passing: against the `__verify-`-prefixed rows it creates, the function selects the product whose single image key ends `/main.svg`, selects the product with no image rows, and omits the product whose primary key ends `.webp`. Do not pipe through `head` — this script deletes its own rows on exit. Live cross-check on the dev branch: the count it returns for the Aheed vendor is now greater than 0, where the pre-slice predicate returned 0. |
| R8  | E2E          | Under `npm run preview` (NOT `npm run dev` — `next dev` cannot load `@prisma/client/wasm`), sign in as an ADMIN demo account, open `/staff/products`, click **Auto-fill Missing Images**. When it reports a non-zero `processed` count, query the dev branch for one affected product: it has exactly one `ProductImage` row with `isPrimary: true`, and that row's `storageKey` does not end `/main.svg`. Reload `/categories` and confirm that product's card renders the new image. |
| R9  | Unit         | `npx vitest run tests/product-metadata.test.ts` exits 0, asserting the exported matcher returns `false` for `("Golden Paneer 500g", "Coca-Cola Zero")` and `true` for `("Golden Paneer 500g", "Amul Malai Paneer")`; plus a case stubbing `fetch` to return a non-matching Open Food Facts payload and asserting `fetchImageUrl` resolves to `null`. |
| R10 | Unit         | In `npx vitest run tests/product-image-pipeline.test.ts`, with `fetch` stubbed so Open Food Facts returns a matching product with an `image_url` and storage stubbed, `runProductImagePipeline` resolves with `needsReview === true`. |
| R11 | Unit         | Same test file: with the Open Food Facts option disabled and `fetch` stubbed by a spy, `runProductImagePipeline` resolves and the spy records no call whose URL contains `openfoodfacts.org`, while the AI generation service stub is called once. |
| R12 | E2E          | Under `npm run preview`, signed in as ADMIN, `/staff/products` renders a checkbox labelled "Use Open Food Facts photos", **checked** on first load. With browser devtools' Network tab open, uncheck it and click **Auto-fill Missing Images**: the `POST /api/admin/jobs/backfill-images` request payload reads `{"useOpenFoodFacts":false}`. Re-check it and click again: the payload reads `{"useOpenFoodFacts":true}`. (That the `false` value actually suppresses the Open Food Facts call is R11's unit case — asserted there against a spy rather than here, because an outbound `fetch` from the Worker leaves no entry in the local observability log.) |
| R13 | Security     | Under `npm run preview`, signed out, `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8787/api/admin/jobs/backfill-images` returns `401`. Signed in as a non-staff customer demo account, the same POST returns `403`. Neither response body contains a product id. |
| R14 | Regression   | `git diff origin/staging...HEAD -- CHANGELOG.md` prints a non-empty diff naming #502. |
| R15 | Regression   | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0. CI on the PR is the authority — a green local run on Windows is necessary, not sufficient. |
