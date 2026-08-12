# P6b1 — Catalogue management: product, category & inventory writes (requirements / acceptance criteria)

The first admin write path to the catalogue. `lib/repositories/products.ts` and `categories.ts` are
read-only today — every exported method is a query — so products, categories and inventory exist
only via `prisma/seed.ts`. This slice adds create/edit for all three inside P6a's `(admin)` panel,
with no schema change and no migration: every field written already exists. Image upload is #167
(P6b2) and is not in this slice. See `plan.md` for why the split, why nothing is deletable, and why
a category's parent must be top-level.

## Pure rules module

R1. `lib/catalogue-form.ts` exists, exports the field-rule functions used by the server actions, and
    imports neither `@/lib/db` nor `@prisma/client` — verifiable by grep: the file contains no
    `from "@/lib/db"` and no `from "@prisma/client"`.

R2. `slugify(name)` in `lib/catalogue-form.ts` returns a string matching `^[a-z0-9]+(-[a-z0-9]+)*$`
    for any non-empty input containing at least one alphanumeric character, and returns `""` for
    input with none.

R3. A submitted blank slug field is replaced by `slugify(name)`; a submitted non-blank slug field is
    normalised through the same function, so no `Product.slug` or `Category.slug` this slice writes
    can fail the R2 pattern.

R4. Price fields are parsed from pounds to integer pence by the existing
    `components/product/parse-price-input.ts` `parsePriceInput()` — `lib/catalogue-form.ts` imports
    it rather than re-implementing pounds-to-pence parsing.

R5. `lib/catalogue-form.ts` rejects, as a named field error rather than a thrown exception: an empty
    `name`, an empty `unitLabel`, a `basePrice` that is absent or negative, a negative or
    non-integer `quantity`, and a negative or non-integer `lowStockThreshold`.

R6. `lib/catalogue-form.ts` rejects an `originalPrice` that is present and not strictly greater than
    `basePrice`; an absent `originalPrice` is accepted and stored as `null`.

R7. `tests/catalogue-form.test.ts` exists and covers R2, R3, R5 and R6, and the whole suite passes
    with `npm test`.

## Repository writes

R8. `lib/repositories/products.ts` exports create and update functions that each take `vendorId` as
    an explicit argument, matching `createCodeForVendor(vendorId, input)` in
    `lib/repositories/discounts.ts` — no write function resolves the vendor from a `FormData` field.

R9. `lib/repositories/categories.ts` exports create and update functions with the same explicit
    `vendorId` shape as R8.

R10. Every write added by this slice includes `vendorId` in the `where` (for updates) or the `data`
     (for creates), so a row belonging to another vendor is indistinguishable from one that does not
     exist.

R11. `lib/repositories/products.ts` exports an admin-side list and an admin-side by-id read that do
     **not** filter on `isActive`, so a deactivated product is listable and editable. The admin list
     is keyset-paginated on `(createdAt, id)` like the storefront's existing `findPage()` — never
     `OFFSET`, per `specs/architecture.md`. The existing storefront `getBySlug()` and
     `listByCategory()` keep their `isActive: true` filter unchanged — verifiable by diff: no
     existing `isActive: true` clause is removed.

R12. `lib/repositories/categories.ts` exports an admin-side list and by-id read with the same
     no-`isActive`-filter property as R11, and the existing `listTopLevel()`/`getBySlug()` keep
     their `isActive: true` filters unchanged.

R13. Creating a product creates its `Inventory` row in the **same** Prisma transaction as the
     `Product` row, so no product created by this slice has a null `inventory` relation.

R14. Updating a product upserts its `Inventory` row, so a product created before this slice with no
     `Inventory` row gains one on first save rather than failing.

R15. A product write whose submitted `categoryId` does not belong to the acting `vendorId` fails
     without writing any row, and returns an error rather than throwing — the category is resolved
     scoped to the vendor, not validated after the fact.

R16. A create or update that violates `@@unique([vendorId, slug])` on either model returns a
     field-level error naming the slug collision, not an unhandled `P2002`.

R17. The `isUniqueViolation` P2002 helper is defined in exactly one module and imported by both
     `lib/repositories/discounts.ts` and the catalogue repositories — verifiable by grep: exactly
     one `code === "P2002"` comparison exists under `lib/`.

R18. A category update that would set `isActive: false` while the category has at least one active
     product or at least one active child category is refused, writes nothing, and returns an error
     message naming what is blocking it.

R19. A category write whose submitted `parentId` refers to a category that is not top-level
     (`parentId !== null`) is refused and writes nothing; `parentId` may also be absent/null.

R20. A category write whose submitted `parentId` refers to the category being edited is refused and
     writes nothing.

## Pages, actions and authorization

R21. `features/admin/catalogue.ts` exists, is marked `"use server"`, and every exported action calls
     `requireVendorRole("ADMIN")` itself before touching a repository — verifiable by reading the
     file: no exported action reaches a write without its own gate.

R22. These five routes exist and render: `/staff/products`, `/staff/products/new`,
     `/staff/products/{id}`, `/staff/categories`, `/staff/categories/{id}`.

R23. Each of the five pages calls `requireVendorRole("ADMIN")` and, when refused, redirects to
     `/login` for a 401 and renders a refusal (not order or catalogue content) for a 403 — the same
     shape `/staff/discounts` uses.

R24. Every page added by this slice sets `export const dynamic = "force-dynamic"`, matching every
     other session-and-DB-reading page in `app/(admin)/`.

R25. The admin product and category routes key on `id`, not `slug` — no route segment added by this
     slice is named `[slug]`.

R26. `components/staff/PanelNav.tsx` renders a Catalogue link, shown only when `canSeeAdmin` is
     true, and the `/staff` landing page renders a matching Catalogue card under the same condition.

R27. No component under `app/(admin)/staff/products/` or `app/(admin)/staff/categories/` and no file
     under `components/staff/` imports `@/lib/db` or `@prisma/client` directly — the ADR-004 slice 2
     ESLint guard passes with no new suppressions (`npm run lint` exits 0 and the diff adds no
     `eslint-disable` comment).

R28. Successful writes call `revalidatePath` for the affected storefront path(s), matching
     `features/admin/discount-codes.ts`.

## Product and category field coverage

R29. The product form submits, and a successful save persists, all of: `name`, `slug`,
     `description`, `categoryId`, `basePrice`, `originalPrice`, `unitLabel`, `origin`, `isHalal`,
     `isFresh`, `isOrganic`, `isActive`, `Inventory.quantity` and `Inventory.lowStockThreshold`.

R30. The category form submits, and a successful save persists, all of: `name`, `slug`, `parentId`,
     `sortOrder` and `isActive`.

R31. The product form displays the product's existing `ProductImage` rows read-only and offers no
     upload, delete or reorder control — `lib/storage.ts` is unmodified by this slice
     (`git diff --stat` lists no change to it).

## Scope guards

R32. This slice adds no migration and no schema change: `prisma/schema.prisma` is unmodified and
     `prisma/migrations/` gains no directory (`git diff --stat origin/staging` lists neither).

R33. No delete action ships: no file added or modified by this slice calls `.delete(` or
     `.deleteMany(` on `product`, `category`, `inventory` or `productImage`.

## Persistent docs

R34. `specs/architecture.md` records the **two-level category tree** as a standing constraint — its
     `Category` excerpt's `parent`/`children` self-relation is unbounded as written, and this slice
     is the first thing to enforce a depth cap. A future reader must find the rule where they read
     the model, not only in a dated slice folder.

## Gates

R35. `CHANGELOG.md` updated (Gate 4).

R36. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
