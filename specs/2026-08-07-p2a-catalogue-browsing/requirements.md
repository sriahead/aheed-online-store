# P2a — Catalogue browsing (requirements / acceptance criteria)

First P2 slice per `specs/roadmap.md`. Split from the roadmap's full P2 line (categories, product
pages, search & filters, pagination) because bundling search/filters in made the slice too large
to validate cleanly — same reasoning as the P1a/P1b split. Search & filters follow as P2b (issue
#34). This slice: categories, product detail pages, images via the storage port, keyset pagination,
placeholder seed data.

R1. `prisma/schema.prisma` gains `Category` (self-referential `parentId`/`parent`/`children`,
    `slug` unique, `name`, `sortOrder`, `isActive`), `Product` (`slug` unique, `name`,
    `description`, `categoryId`, `basePrice` Int pence, `unitLabel` String, `isActive`,
    `createdAt`), `ProductImage` (`productId`, `storageKey` — relative key, never a URL — `alt`,
    `sortOrder`, `isPrimary`), `Inventory` (`productId` unique, `quantity`, `lowStockThreshold`,
    `updatedAt`) — matching `specs/architecture.md` §3.2's representative schema, including its
    `Product(categoryId, isActive)` and `Product(isActive, basePrice)` composite indexes. Generated
    via `prisma migrate dev` against the real Neon staging instance (no separate local Postgres —
    same pattern P1a used) and committed under `prisma/migrations/`.
R2. `lib/repositories/categories.ts` exports a `CategoryRepository` interface and a
    `getCategoryRepository()` factory (Prisma-backed, constructed fresh per call — never a
    cross-request singleton, per `lib/db.ts`'s established pattern) with methods to list top-level
    categories and fetch one category by slug together with its direct children.
R3. `lib/repositories/products.ts` exports a `ProductRepository` interface and a
    `getProductRepository()` factory with methods to: list a category's active products with
    keyset (cursor) pagination — cursor on `(createdAt, id)`, Prisma `cursor` + `take`, no
    `OFFSET` — and fetch one active product by slug, including its images (ordered by `sortOrder`,
    primary image first) and inventory status.
R4. Presentation code (`app/`, `components/`) never imports `@prisma/client` directly — all data
    access goes through the repositories from R2/R3, per `specs/architecture.md`'s layering rule.
R5. `app/(storefront)/categories/page.tsx` lists top-level active categories, linking to each.
R6. `app/(storefront)/categories/[slug]/page.tsx` shows a category's active products as a
    keyset-paginated grid (`components/product`'s product card), with a "next page" control that
    carries the cursor forward via a search param — no full-list `OFFSET` fetch at any page depth.
R7. `app/(storefront)/products/[slug]/page.tsx` shows one active product: name, description,
    formatted price, image gallery (all images, primary first), and an in-stock/out-of-stock
    indicator derived from `Inventory.quantity`. Returns Next.js's `notFound()` (404) for an
    unknown or inactive slug — not a silent empty page.
R8. `components/product/format-price.ts` exports a pure function `formatPrice(pence: number):
    string` (`450` → `"£4.50"`, no floating-point money math) — unit-tested directly, independent
    of any repository/DB access.
R9. Every product image renders via `composePublicUrl(CDN_BASE_URL, storageKey)`
    (`lib/storage.ts`, already exists) — no raw R2/S3 URL ever appears in a response or the DB.
R10. `prisma/seed.ts` is extended to create a handful of placeholder categories and products (data
    invented for this slice, not real Aheed inventory) and, for each product image, actually
    upload a checked-in placeholder asset (`prisma/seed-assets/placeholder-product.svg`) through
    `lib/storage.ts`'s `putObject()` before writing the `ProductImage` row — proving the real
    storage round-trip rather than seeding keys that don't resolve to anything.
R11. Catalogue pages (`/categories`, `/categories/[slug]`, `/products/[slug]`) are reachable
    without authentication — no regression to guest browsing from adding this feature.
R12. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
R13. `CHANGELOG.md` updated (Gate 4), including the still-open production storage-secrets item
    from `plan.md`.
