# P2a — Catalogue browsing (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `npx prisma migrate status` shows the new migration applied; `prisma/schema.prisma` contains `model Category`/`Product`/`ProductImage`/`Inventory` with the fields/indexes listed in R1; `npx tsc --noEmit` passes (generated Prisma types compile). |
| R2  | `lib/repositories/categories.ts` exists, exports `CategoryRepository` + `getCategoryRepository()`; `npm run preview` (Workers runtime — `next dev` can't load `@prisma/client/wasm`) hitting `/categories` returns real category data, not an error state. |
| R3  | `lib/repositories/products.ts` exists, exports `ProductRepository` + `getProductRepository()`; `npm run preview` hitting `/categories/[slug]` with more products seeded than one page size returns a `next cursor`, and requesting page 2 with that cursor returns a disjoint set from page 1 (no `OFFSET` in the generated SQL — check via Prisma's query log or the `cursor`/`take` call site directly). |
| R4  | `grep -rn "@prisma/client" app components` (excluding `lib/`) returns nothing. |
| R5  | `npm run preview`, visit `/categories` — lists the seeded top-level categories with working links. |
| R6  | `npm run preview`, visit `/categories/[seeded-slug]` — shows a product grid; clicking "next page" changes the result set and updates the cursor in the URL. |
| R7  | `npm run preview`, visit `/products/[seeded-slug]` — shows name/description/price/images/stock status; visiting `/products/does-not-exist` returns a 404 page, not a blank/error page. |
| R8  | `npx vitest run tests/format-price.test.ts` — covers at least one whole-pound case (`450` → `"£4.50"`) and one sub-pound case (`50` → `"£0.50"`), passes without touching Prisma/network. |
| R9  | `curl` (or browser devtools Network tab) on a rendered product page's image `src` — matches `${CDN_BASE_URL}/${storageKey}` exactly, resolves 200, and no response body contains a raw `r2.cloudflarestorage.com`/S3 endpoint URL. |
| R10 | `npm run db:seed` (or the project's actual seed command) exits 0; querying `ProductImage` afterward shows real `storageKey` values; fetching `${CDN_BASE_URL}/${storageKey}` for a seeded row returns the placeholder SVG with a 200, not a 404. |
| R11 | `npm run preview`, hit `/categories`, `/categories/[slug]`, `/products/[slug]` in a fresh/incognito session (no auth cookie) — all return 200, none redirect to `/login`. |
| R12 | `npm run lint && npm run format:check && npx tsc --noEmit && npx vitest run` — all exit 0. |
| R13 | `git diff origin/staging...HEAD --name-only` includes `CHANGELOG.md`, and its `[Unreleased]` section documents the production storage-secrets open item from `plan.md`. |
