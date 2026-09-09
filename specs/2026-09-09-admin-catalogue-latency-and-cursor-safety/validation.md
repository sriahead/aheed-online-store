# Admin catalogue latency and cursor safety (validation)

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

This slice touches Prisma on every path it changes, so **`npm run preview` is the only valid
harness** — `next dev` runs in real Node, cannot load `@prisma/client/wasm`'s query engine, and
renders a silent error state on every DB-touching route (`CLAUDE.md`).

1. **Read the real vendor hosts out of the database you are actually connected to. Do not assume
   the `nocaped.com` convention.** A previous slice's validation hardcoded those hostnames and every
   request silently redirected to `/coming-soon`, because that dev DB was seeded `localhost:8787`
   and `srimart.localhost`. Write a short script under `scripts/` (not `npx tsx -e`, which fails
   silently on this Windows setup once it imports a package) that prints
   `prisma.vendorDomain.findMany({ select: { host: true, vendorId: true } })` against the same
   `DATABASE_URL` `npm run preview` uses, and use those hosts for every `curl` below. Delete the
   script afterwards.
2. **Get a store-admin session.** `/staff/products` is `requireVendorRole("ADMIN")`. Sign in as
   `demo-store-admin@example.com` (a vendor ADMIN, not a platform admin) with the
   `DEMO_ACCOUNT_PASSWORD` value from `.dev.vars`, against Better Auth's real endpoint
   `POST /api/auth/sign-in/email` — **not** `/sign-in`, which does not exist (`CLAUDE.md`). Save the
   cookie jar and reuse it.
3. **Exclude the generated KMS bundle from every grep.** `app/(admin)/staff/runbook/docs.ts` embeds
   the full body of every doc, including this spec, so it matches prose about the very strings being
   searched for. Append `| grep -v "runbook/docs.ts"` to any repo-wide grep.
4. Where a row greps rendered HTML, remember that React escapes `&`, `<`, `>`, `"` and `'`, and that
   Next embeds an RSC hydration payload repeating page strings — count landmarks or anchored
   matches, never bare substrings.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | `test -f lib/repositories/pagination.ts` exits 0. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0 with both files passing. |
| R2 | Unit | `npx vitest run tests/pagination.test.ts` exits 0, with named cases covering `undefined`, `""`, `"   "`, `"not-a-uuid"`, `"1 OR 1=1"`, `"../../etc"` and a valid UUID — the first six returning an object with no `cursor` key, the last returning one carrying `cursor` and `skip: 1`. |
| R3 | Integration | `grep -rn "cursor: { id:" lib/repositories/ \| grep -v "runbook/docs.ts"` prints matches from `lib/repositories/pagination.ts` **only** — zero lines naming `products.ts` or `orders.ts`. |
| R4 | Unit | `npx vitest run tests/pagination-guard-coverage.test.ts` exits 0. Then confirm it actually fails on a violation: temporarily add a raw `cursor: { id: raw }` line to `lib/repositories/orders.ts`, re-run, see it fail, and revert with `git checkout -- lib/repositories/orders.ts`. A guard test never observed failing is not evidence. |
| R5 | E2E | Under `npm run preview`, with the admin cookie jar: `curl -s -o /dev/null -w "%{http_code}" -b cookies.txt "http://<host>/staff/products?cursor=not-a-uuid"` prints `200`. Fetch the same URL's body and confirm it contains the product table and the same first-page product names as `/staff/products` with no cursor. |
| R6 | E2E | Same as R5 with a well-formed UUID naming no row, e.g. `?cursor=00000000-0000-4000-8000-000000000000`. Prints `200` and renders the first page. |
| R7 | E2E | Load `/staff/products?category=<a real department id>`, extract the `cursor` value from the rendered "next page" href, then request `/staff/products?category=<a DIFFERENT department id>&cursor=<that cursor>`. Expect `200` and a product list consistent with the second category. Separately, confirm `build-notes.md` records the Build-time run of this same sequence against pre-slice code and states plainly whether `#682`'s reported error reproduced. The stack, if it did, comes from `/staff/errors`, the `ErrorEvent` row, or `POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query` with a body of `{"sql": "select * from logs where level = 'error' order by ts_ms desc limit 20"}`. **A missing or hedged Build record fails this row** — the whole point is that the report is not closed by assertion. |
| R8 | E2E | `curl -s -o /dev/null -w "%{http_code}" "http://<storefront host>/search?cursor=not-a-uuid"` prints `200`, and the body renders product cards. No session needed. |
| R9 | Regression | `grep -n "pagination.ts" specs/architecture.md` returns at least one line inside the Pagination section. `git diff origin/staging -- specs/architecture.md` shows the `version` incremented and `updated: 2026-09-09`. `npm run kms:validate` exits 0. |
| R10 | Unit | `grep -n "cache" lib/tenant.ts` shows `import { cache } from "react"` and `getCurrentVendorIdOrNull` wrapped in it. `grep -n "intentionally omitted" lib/tenant.ts` returns nothing. |
| R11 | Unit | `grep -n "cache(" lib/categories-service.ts` shows `listCategoriesForAdmin` wrapped. `npx vitest run` for any category service test exits 0. |
| R12 | Integration | Live, from R13's query log for one render of a storefront page that uses both reads (`/search`): exactly one `Category` query per distinct accessor, not one per call site. |
| R13 | Performance | Under `npm run preview` with a freshly restarted worker, request `/staff/products` once, then read the query log via `POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query` with a body of `{"sql": "select ts_ms, message from logs order by ts_ms desc limit 200"}`. Count queries touching `Vendor`/`VendorDomain` and `Category`. Confirm `build-notes.md` records both the Build-time pre-slice counts and these post-slice counts, that vendor resolution is strictly lower, and that `Category` has not increased. |
| R14 | Security | Under `npm run preview`: (a) `POST /api/auth/sign-in/email` with the valid `demo-store-admin@example.com` credentials returns a success response and sets a session cookie — proving `cache()` did not throw in Better Auth's route-handler context, which is not a React render; (b) repeat the same POST with a wrong password past the configured limit and confirm the refusal still fires. Note in the results that `tests/auth.test.ts` mocks `@/lib/tenant` and therefore cannot substitute for this check. |
| R15 | Regression | `npx vitest run tests/tenant.test.ts` exits 0. `git diff origin/staging -- tests/tenant.test.ts` shows no assertion removed or weakened (added `vi.resetModules()`/cache-reset scaffolding is acceptable; a deleted or loosened `expect` is not). |
| R16 | Security | Read `git diff origin/staging -- lib/ app/ features/ components/` in full and confirm every memoisation it adds is React `cache()`. Specifically: `grep -n "new Map(\|globalThis\.\|^let \|^const .* = new " lib/tenant.ts lib/categories-service.ts` returns no module-scope mutable binding holding a vendor id, a category list or a Prisma client. |
| R17 | Unit | `grep -n "vendorId, createdAt, id" prisma/schema.prisma` returns the `@@index` line inside the `Product` model. |
| R18 | Integration | The migration was created with `npx prisma migrate dev --create-only`. `cat prisma/migrations/<new>/migration.sql` shows the `CREATE INDEX` and, critically, `grep -c "DROP INDEX" prisma/migrations/<new>/migration.sql` returns `0`. If the generated file contained a `DROP INDEX` for the `pg_trgm` indexes, record in `build-notes.md` that it was removed by hand before applying. |
| R19 | Integration | `DIRECT_URL=<dev direct URL> npx prisma migrate status` reports no pending migrations and no drift. Confirm the `DIRECT_URL` used is the **dev** Neon project by diffing `.env`/`.dev.vars` against `secrets/staging.vars` and `secrets/production.vars` first — this repo has previously run a migration against production believing it was staging. |
| R20 | Performance | Capture `EXPLAIN (ANALYZE, BUFFERS)` for `SELECT ... FROM "Product" WHERE "vendorId" = $1 ORDER BY "createdAt" DESC, "id" DESC LIMIT 26` against the dev database before and after the migration; paste both plans into `build-notes.md`. Pass = both plans recorded. A continued `Seq Scan` is an acceptable outcome at 2,026 rows and is not a failure. |
| R21 | Regression | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice under `## [Unreleased]`. |
| R22 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run` — **run alone, with no other build in progress** — reports at least 115 files / 1520 tests, all passing. A run reporting `Failed to start forks worker` or a file count below the baseline is a non-result to re-run, not a pass (`CLAUDE.md`). Update the baseline in `CLAUDE.md` if it moved. |
