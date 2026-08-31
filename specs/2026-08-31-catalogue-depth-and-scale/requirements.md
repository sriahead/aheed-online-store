# Catalogue depth and scale — requirements / acceptance criteria

Closes **#489**. Seeds the second `Category` tier that has existed in the schema since P2a but that
no fixture has ever populated, adds an env-gated generated catalogue so the app can be exercised at
roughly 2,000 products instead of 21, and re-measures the Gate-3 read paths at both scales. The
existing NFR verdict (`API p95 < 400ms`, "meets with a 2.9x margin") was taken at `Product` = 22, a
scale at which `docs/developer-portal/nfr-baseline.md` itself concludes no query is index-sensitive.
See `plan.md` for why remediation is deliberately **not** in scope, and why this adds a second
measurement harness rather than extending the HTTP-only `scripts/measure-nfr.ts`.

Throughout, "a clean seed run" means `npm run db:seed` against a database whose `Category`,
`Product`, `ProductImage` and `Inventory` tables are empty for the vendor under test, **with both
`SEED_AHEED_HOST` and `SEED_SRIMART_HOST` set**. That last condition is not optional: `#276` made
SriMart seed only when *both* hosts are present, and `prisma/seed.ts` warns but does not fail when
`SEED_SRIMART_HOST` is missing. Every requirement below that names a SriMart count assumes both are
set; with only `SEED_AHEED_HOST`, SriMart is skipped entirely and those counts are zero rather than
failing.

R1. `prisma/seed.ts`'s Aheed catalogue fixture declares at least **three subcategories under each of
    its nine existing top-level departments** (at least 27 subcategories). After a clean seed run,
    every one of those rows has a non-null `parentId` whose target is one of the nine departments and
    carries the same `vendorId`.

R2. `prisma/seed.ts`'s SriMart catalogue fixture declares at least **two subcategories under each of
    its two departments** (at least 4). Their `slug` values are disjoint from every Aheed category
    slug, matching the existing convention that SriMart's catalogue is deliberately distinct.

R3. After a clean seed run, a query for categories whose parent itself has a non-null `parentId`
    returns **zero rows** for both vendors — the two-level cap enforced by
    `lib/repositories/categories.ts`'s `checkParent` is not bypassed by the seed writing rows directly.

R4. With `SEED_SCALE_PRODUCTS` **unset**, a clean seed run creates exactly **18 Aheed products** and
    **3 SriMart products** — today's counts, unchanged — plus the R1/R2 subcategories. No generated
    products exist.

R5. With `SEED_SCALE_PRODUCTS=2000`, a clean seed run creates exactly **2000 additional Aheed
    products** beyond the 18 curated ones. Every one has `isActive = true`, a `categoryId` referencing
    one of R1's subcategories, exactly one `ProductImage` with `isPrimary = true`, and exactly one
    `Inventory` row.

R6. The generated products are **deterministic**. Two clean seed runs with the same
    `SEED_SCALE_PRODUCTS` value produce identical multisets of
    `(slug, name, basePrice, origin, isHalal, isFresh, isOrganic, quantity)` and identical
    product-slug-to-category-slug assignments. The generated code path calls no `Math.random()`;
    randomness comes from a seeded pseudo-random generator with a fixed, committed seed value.

R6b. The generator function lives in its **own module** (e.g. `prisma/generate-catalogue.ts`) which
     `prisma/seed.ts` imports, and importing that module executes **no** database or storage work.
     This is a hard constraint, not a style preference: `prisma/seed.ts` invokes `main()` at module
     scope, so any test that imported the generator from `seed.ts` would run the entire seed against
     whatever database the environment resolves. The R6 determinism test imports the generator module
     and must not import `prisma/seed.ts`.

R7. Every generated product's `slug` begins with a single documented prefix that **no curated product
    slug uses**, and `prisma/seed.ts` exposes a documented removal path that deletes exactly the
    generated products together with their `ProductImage` and `Inventory` rows, leaving all 18 curated
    Aheed products, all 3 SriMart products and every category intact.

R8. Across the 2000 generated products, the number of **distinct `ProductImage.storageKey` values is
    at most 40** (roughly one per subcategory rather than one per product), and every such key
    resolves to an object that the seed run actually uploaded.

R9. The generated set contributes **at most 40 `putObject` calls** to a seed run — one per shared
    pool key from R8, not one per product. Concretely: the total `putObject` count for a clean
    `SEED_SCALE_PRODUCTS=2000` run exceeds the total for a clean run with `SEED_SCALE_PRODUCTS` unset
    by **no more than 40**, and a second `SEED_SCALE_PRODUCTS=2000` run over the already-seeded
    database adds no further generated-pool uploads. `refreshProductImages` does not iterate the
    generated set at all. The seed prints its total `putObject` count on completion so both figures
    are observable rather than inferred.

R10. The generated write path uses `createMany` for products, images and inventory, and contains
     **no per-product `prisma.product.create` or `tx.product.create` call**. The curated path may keep
     its existing per-product `create`.

R11. Running the seed **twice** with `SEED_SCALE_PRODUCTS=2000` leaves Aheed's total product count
     identical after the second run to what it was after the first — the generated set has its own
     idempotency check rather than relying on the existing per-category-slug one.

R12. `SEED_SCALE_PRODUCTS` affects the **Aheed vendor only**. SriMart's product count is 3 after a
     clean seed run regardless of the variable's value.

R13. Before creating any generated product, the seed prints the **resolved database host** it is
     about to write to. The printed line contains the host only — it does **not** contain the password
     or the full connection string (the `#175` plaintext-credential lesson).

R14. This slice adds **no migration and no schema change**: `git diff` against the base branch shows
     `prisma/schema.prisma` unmodified, and `prisma/migrations/` gains no new directory.

R15. This slice changes **no application code**: `git diff --name-only` against the base branch lists
     no file under `app/`, `components/`, `features/` or `lib/`.

R16. `scripts/measure-catalogue-queries.ts` exists as a committed TypeScript file (not an
     `npx tsx -e` one-liner), builds its own `PrismaClient` from the bare `@prisma/client` specifier
     as `prisma/seed.ts` does, and passes that client into the repository functions as an explicit
     parameter rather than resolving one through `lib/db`.

R16b. Before its timings, `scripts/measure-catalogue-queries.ts` prints a **catalogue-shape summary**
      containing, per vendor: total product count, count of products whose slug carries R7's
      generated prefix, top-level category count, subcategory count, the number of categories whose
      parent itself has a parent, the number of distinct `ProductImage.storageKey` values among
      generated products, the number of generated products carrying exactly one `isPrimary` image,
      and the number carrying exactly one `Inventory` row. This is what makes R1-R5, R8, R11 and R12
      checkable from one command by a reader with no memory of this slice.

R17. `scripts/measure-catalogue-queries.ts` reports p50 and p95 for at least these seven read paths:
     storefront catalogue listing, `getCategoryBySlug`, `searchProducts`, `getAvailableSpecialities`,
     staff order list without search, `listForUser` (order history), and the
     `getFinancialsForStaff` aggregate. It prints the sample count and excludes a warm-up sample from
     the percentiles, matching `scripts/measure-nfr.ts`'s existing convention.

R18. `docs/developer-portal/nfr-baseline.md` gains a **new dated section** reporting, for every read
     path in R17, p50 and p95 at both the curated scale (21 products) and the generated scale
     (2,018 Aheed products plus SriMart's 3). The existing "Summary against the targets",
     "API latency" and "Index and query review" tables are **not modified** — the new section sits
     beside them, and states that the older figures were taken at `Product` = 22 so the two are not
     read as a before/after of anything but scale.

R19. The new section records the **Neon endpoint host** the measurement ran against, and that host
     matches the dev entry in `secrets/` and matches neither the staging nor the production host.

R20. For every read path in R17, the new section states explicitly whether its p95 meets
     `specs/mission.md`'s `API p95 < 400ms` target at the generated scale. Where a path breaches the
     target, the section names the GitHub issue filed for it; where none is filed because none
     breaches, it says so.

R21. `CHANGELOG.md` updated (Gate 4).

R22. `npm run lint`, `npx tsc --noEmit`, `npx vitest run` and `npm run format:check` all pass.
