# Admin catalogue latency and cursor safety (requirements / acceptance criteria)

Closes the store owner's 2026-09-09 report (`#682`: an error on `/staff/products` after browsing
through several categories, plus repeated category queries) and the two parts split out of `#503`
(`#670`: memoise vendor resolution, and the missing ordered `Product` index). Three independent
parts in one slice because `#682`'s read-amplification half and `#670`'s part 2 are the same work.
Full narrative, including what is deliberately excluded, in `plan.md`.

## Part A — no unvalidated cursor reaches Prisma

R1. A new pure module `lib/repositories/pagination.ts` exports a function that takes a raw cursor
    value (`string | undefined`) and returns the Prisma keyset arguments for it — either an empty
    object, or an object carrying `cursor` and `skip: 1`. It imports nothing from `@/lib/db`,
    `next/headers`, `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`, so
    `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` both continue
    to pass with the file present.

R2. That function returns the empty object (no cursor applied, i.e. the first page) for every input
    that is not a well-formed UUID: `undefined`, the empty string, whitespace only, a non-UUID
    string, and a string containing SQL or URL metacharacters. `Product.id` and `Order.id` are
    `@default(uuid())`, so UUID shape is the correct syntactic test.

R3. The five existing call sites all route through that function: `findPage`
    (`lib/repositories/products.ts`), `listInventoryForStaff` (same file), `listProductsForAdmin`
    (same file), and the two list functions in `lib/repositories/orders.ts`. After this slice the
    literal `cursor: { id:` appears in `lib/repositories/` **only** inside
    `lib/repositories/pagination.ts`.

R4. A test fails if a sixth unguarded site is added: it walks every `.ts` file in
    `lib/repositories/` discovered from the filesystem, with no allowlist, and fails when any file
    other than `pagination.ts` constructs a Prisma `cursor` argument directly.

R5. Live under `npm run preview`: `GET /staff/products?cursor=not-a-uuid` (authenticated as a store
    admin) returns HTTP 200 and renders the first page of products — not a 500, and not an error
    state.

R6. Live under `npm run preview`: a `GET` of `/staff/products` whose `cursor` is a well-formed UUID
    naming no `Product` row — for example `00000000-0000-4000-8000-000000000000` — returns HTTP 200
    and renders the first page of products.

R7. Live under `npm run preview`: a cursor obtained from a real "next page" link under one category
    filter, then applied under a *different* category filter, returns HTTP 200 and renders a page of
    products consistent with the second filter. This is `#682`'s named hypothesis. The same
    sequence is run **against the pre-slice code during Build** — reproduced or not reproduced, with
    the real stack from an `ErrorEvent` row, `/staff/errors`, or `wrangler dev`'s observability
    query endpoint if it reproduces — and that outcome is recorded in `build-notes.md`. If the
    reported error was never reproduced, `build-notes.md` and the CHANGELOG say so plainly and
    `#682` is not claimed fixed on the strength of the guard alone.

R8. Live under `npm run preview`: `GET /search?cursor=not-a-uuid` on the storefront returns HTTP 200
    and renders the first page, confirming the same guard reached the customer-facing lists.

R9. `specs/architecture.md`'s Pagination section states that a keyset cursor arriving from a URL is
    untrusted input validated before it reaches Prisma, and names
    `lib/repositories/pagination.ts` as the single place that happens. Its front-matter `version` is
    incremented and `updated` set to the slice date.

## Part B — one render resolves the vendor and the categories once

R10. `getCurrentVendorIdOrNull` in `lib/tenant.ts` is wrapped in React `cache()`, imported from
     `react`, matching the existing pattern in `lib/vendor-service.ts` and `lib/db.ts`. The
     docstring no longer claims per-request memoisation is intentionally omitted.

R11. `listCategoriesForAdmin` in `lib/categories-service.ts` is memoised per request with React
     `cache()`, so N calls within one render issue one query.

R12. The storefront category reads exposed by `getCategoryRepository()` — `listTopLevel` and
     `listTree` — resolve at most one query each per request regardless of how many times they are
     called during that render.

R13. Query counts for one render of `/staff/products` are measured live under `npm run preview` via
     `wrangler dev`'s observability query endpoint, **against the pre-slice code during Build and
     against the finished artifact**, and both sets of counts are recorded in `build-notes.md`. The
     `Vendor`/`VendorDomain` resolution count after is strictly lower than before; the `Category`
     count after does not increase. The pre-slice measurement is taken at Build, because the branch
     no longer contains that code by the time Validate runs.

R14. `getCurrentVendorIdOrNull` under React `cache()` still executes without throwing inside Better
     Auth's route-handler context, which is **not** a React render: live under `npm run preview`, a
     valid sign-in through `POST /api/auth/sign-in/email` succeeds, and repeated wrong-password
     attempts against the same endpoint are still refused once the rate limit is reached.
     **`tests/auth.test.ts` cannot cover this**: it mocks `@/lib/tenant` wholesale (line 13), so
     `authOnRequest`'s existing fail-closed assertions pass whether or not the real memoised
     function works in that context. Those assertions must still pass (R22), but the live check is
     what actually covers `#469`'s path here.

R15. `tests/tenant.test.ts` passes unchanged in behaviour — the `cache()` wrapper does not leak a
     memoised vendor id between `it()` blocks. If isolation requires it, the test file may add
     module or cache resetting, but no existing assertion is weakened or deleted.

R16. No cross-request cache is introduced. Every memoisation added by this slice is React `cache()`,
     which is request-scoped; no module-scope variable, `Map`, or global retains a Prisma client, a
     vendor id or a category list between requests.

## Part C — the list ordering has an index

R17. `prisma/schema.prisma`'s `Product` model declares `@@index([vendorId, createdAt, id])`.

R18. The migration is generated with `prisma migrate dev --create-only` and its `migration.sql` is
     read before being applied. The committed `migration.sql` contains the `CREATE INDEX` for R17
     and **no** `DROP INDEX` statement for any of the three hand-authored `pg_trgm` indexes from
     `20260820143949_p7_5de_order_search_trigram`. `CLAUDE.md` records this spurious drop occurring
     on every migration generated since `#508`.

R19. After applying, `npx prisma migrate status` against `DIRECT_URL` reports no pending migrations
     and no drift.

R20. `EXPLAIN (ANALYZE, BUFFERS)` for the admin product list's ordered query is captured against the
     dev database both before and after the migration and both plans are recorded in
     `build-notes.md`. The planner is **not** required to choose the new index: at 2,026 rows a
     sequential scan can legitimately remain cheaper, and `#670` describes this part as insurance
     rather than a current defect. Recording the real plan, not producing a particular one, is the
     requirement.

## Gates

R21. `CHANGELOG.md` updated on the branch (Gate 4).

R22. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice, and
     `npx vitest run` reports no fewer than the current baseline of 115 files / 1520 tests, with the
     new baseline recorded in `CLAUDE.md` if it moves.
