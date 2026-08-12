# P6b1 — Catalogue management: product, category & inventory writes (validation)

**Before any live row below.** Diff `.env` and `.dev.vars` against **both** `secrets/staging.vars`
and `secrets/production.vars` and confirm the Neon host is **staging** — two files agreeing with
each other proves nothing if both agree on the wrong target (P5a's migration reached production this
way). `npm run preview` reads `.dev.vars`; scripts and `prisma` read `.env`. Every live row below
runs against `npm run preview`, never `npm run dev` — plain `next dev` cannot load
`@prisma/client/wasm` and renders a silent error state instead of failing.

Live rows need an **ADMIN** session on the Aheed host and, for the cross-vendor rows, a session on
the SriMart host. On Windows, kill orphaned `node`/`workerd` processes between `preview` runs before
retrying a failure.

| Req | How to verify |
|-----|---------------|
| R1  | `ls lib/catalogue-form.ts` succeeds, and `grep -nE '^\s*import .* from "(@/lib/db\|@prisma/client)"' lib/catalogue-form.ts` returns no matches. |
| R2  | In `tests/catalogue-form.test.ts`, assert `slugify("Basmati Rice 5kg")` → `basmati-rice-5kg`, `slugify("  Ghee  &  Oil  ")` matches `^[a-z0-9]+(-[a-z0-9]+)*$`, and `slugify("!!!")` → `""`. `npm test` exits 0. |
| R3  | Live on `npm run preview`: create a product named `Validation Rice R3` leaving the slug field blank → the created row's slug is `validation-rice-r3`. Create a second with slug typed as `  Validation SPICE R3 ` → stored slug is `validation-spice-r3`. Read both back with a throwaway script against the same staging DB. |
| R4  | `grep -n "parse-price-input" lib/catalogue-form.ts` matches an import; `grep -rn "\* 100" lib/catalogue-form.ts` returns no second pounds-to-pence implementation. |
| R5  | Unit tests in `tests/catalogue-form.test.ts` assert a named field error (not a throw) for each of: empty `name`, empty `unitLabel`, absent `basePrice`, `basePrice` = `-1`, `quantity` = `-1`, `quantity` = `1.5`, `lowStockThreshold` = `-1`. `npm test` exits 0. |
| R6  | Unit tests assert `originalPrice` = `basePrice` and `originalPrice` < `basePrice` are both rejected, `originalPrice` > `basePrice` is accepted, and a blank `originalPrice` yields `null`. |
| R7  | `ls tests/catalogue-form.test.ts` succeeds; `npm test` exits 0 with the new file's cases included in the reported count. |
| R8  | Read `lib/repositories/products.ts`: the create and update functions' first or second positional parameter is `vendorId: string`. `grep -n "formData\|FormData" lib/repositories/products.ts` returns no matches. |
| R9  | Same two checks against `lib/repositories/categories.ts`. |
| R10 | Read every write function added in `lib/repositories/products.ts` and `categories.ts`: each `update`/`updateMany` carries `vendorId` in its `where`, each `create` carries `vendorId` in its `data`. No exceptions. |
| R11 | `git diff origin/staging -- lib/repositories/products.ts` shows no removed `isActive: true` line, and the new list function's `orderBy` is `[{ createdAt: "desc" }, { id: "desc" }]` with `cursor`/`take`, no `skip:` other than the cursor's `skip: 1`. Live: deactivate a product via the form, then confirm it still appears at `/staff/products` and still loads at `/staff/products/{id}`, while `/products/{slug}` on the storefront 404s. Page the admin list past its first page and confirm the two pages are disjoint and their union matches a direct `count()`. |
| R12 | `git diff origin/staging -- lib/repositories/categories.ts` shows no removed `isActive: true` line. Live: deactivate a category with no active products, confirm it still lists and edits under `/staff/categories`, and no longer appears in the storefront's department navigation. |
| R13 | Live: create a product, then query the created row with a throwaway script — its `inventory` relation is non-null and `quantity` equals what was submitted. Also read the repository source and confirm the `Product` and `Inventory` creates are inside one `$transaction` / nested-create, not two sequential calls. |
| R14 | Live: pick a seeded product, `DELETE` its `Inventory` row by hand with a throwaway script, then save the product form → the save succeeds and an `Inventory` row exists again with the submitted quantity. |
| R15 | Live: on the Aheed host, render `/staff/products/new`, then submit the create action with `categoryId` replaced by a **SriMart** category id read from the DB. The response is an error, and a `count` of Aheed and SriMart products taken before and after is unchanged on both. |
| R16 | Live: create a product with the slug of an existing Aheed product → the form re-renders with a field-level slug error, HTTP 200, no 500 in the `preview` console, and the product count is unchanged. Repeat for a category. |
| R17 | `grep -rn 'code === "P2002"' lib/` returns **exactly one** line; `grep -rn "isUniqueViolation" lib/` shows it imported by `lib/repositories/discounts.ts` and by the catalogue repository that needs it. |
| R18 | Live: attempt to deactivate a category that has ≥1 active product → refused, error names the blocker, and the category's `isActive` read back from the DB is still `true`. Repeat with a category that has an active child. Then deactivate a category with neither → succeeds. |
| R19 | Live: submit a category save with `parentId` set to a category that itself has a non-null `parentId` → refused, nothing written (row unchanged when read back). Submit with `parentId` blank → succeeds. |
| R20 | Live: submit a category save with `parentId` equal to that category's own id → refused, row unchanged when read back. |
| R21 | `head -1 features/admin/catalogue.ts` is `"use server";`. Read every exported function: each calls `requireVendorRole("ADMIN")` before its first repository call. |
| R22 | Live on `npm run preview` with an ADMIN session: each of the five URLs returns HTTP 200 and renders its heading. `/staff/products/{id}` uses a real product id; `/staff/categories/{id}` a real category id. |
| R23 | Live, for each of the five routes: signed out → 302 to `/login`; signed in as a CUSTOMER → refusal text rendered, HTTP 200, and no product name, price or category name present in the response body. |
| R24 | `grep -rn 'export const dynamic = "force-dynamic"' "app/(admin)/staff/products" "app/(admin)/staff/categories"` matches once per `page.tsx` added. |
| R25 | `find "app/(admin)/staff/products" "app/(admin)/staff/categories" -name "[[]slug[]]" -type d` returns nothing; the dynamic segments are `[id]`. |
| R26 | Live: as an ADMIN, `/staff` renders a Catalogue card and the nav renders a Catalogue link. As a STAFF-only member, neither appears (same response body check as R23's refusal rows). |
| R27 | `npm run lint` exits 0. `git diff origin/staging` adds no `eslint-disable` line. `grep -rnE '^\s*import .* from "(@/lib/db\|@prisma/client)"' "app/(admin)/staff/products" "app/(admin)/staff/categories" components/staff/` returns no matches. |
| R28 | `grep -n "revalidatePath" features/admin/catalogue.ts` matches. Live: edit a seeded product's name, then load its storefront `/products/{slug}` page in the same `preview` session → the new name renders without a restart. |
| R29 | Live: create a product with a distinct non-default value for every field in R29, then read the row (and its `Inventory`) back with a throwaway script and compare all fourteen values field by field. |
| R30 | Live: create a category with a distinct non-default value for `name`, `slug`, `parentId`, `sortOrder`, `isActive`, read the row back and compare all five. |
| R31 | Live: `/staff/products/{id}` for a seeded product renders its existing image, and the page source contains no `<input type="file">`. `git diff --stat origin/staging -- lib/storage.ts` shows no change. |
| R32 | `git diff --stat origin/staging -- prisma/` is empty. |
| R33 | `git diff origin/staging` contains no added line matching `\.delete(` or `\.deleteMany(` against `product`, `category`, `inventory` or `productImage`. |
| R34 | `git diff origin/staging -- specs/architecture.md` is non-empty, and reading the `Category` model excerpt in context states the two-level cap and that a category's parent must itself be top-level. `npm run kms:validate` exits 0 (front-matter still valid after the version bump). |
| R35 | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice under `[Unreleased]`. |
| R36 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` each exit 0 — and the `gates` job is green on the PR, which is the real Gate 3, not the local run. |
