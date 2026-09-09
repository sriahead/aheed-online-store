# Admin catalogue latency and cursor safety (build notes)

Written at the end of Build, before the Clear. The validating context is fresh and has only the
spec, the artifact and this file.

**Read this first: the reported error's named hypothesis did not reproduce, and two different
defects did.** That is the single most important thing this file carries, because it changes what
Validate should be checking for.

## What changed and why

### Part A — the cursor guard

- **`lib/repositories/pagination.ts`** (new) — `keysetCursorArgs()` turns a raw URL cursor into
  Prisma's `cursor`/`skip` pair, returning the first page for anything that is not a single
  well-formed id, and `runKeysetPage()` re-runs a cursored query from page one when it comes back
  empty. Pure, no imports at all, so `tests/repository-purity.test.ts` and
  `tests/repository-client-injection.test.ts` are both unaffected by its presence.
- **Five call sites converted** — `findPage`, `listInventoryForStaff` and `listProductsForAdmin`
  in `lib/repositories/products.ts`; `listForUser` and `listOrdersForStaff` in
  `lib/repositories/orders.ts`. The spec's R3 required exactly this; `#682` names only
  `/staff/products`, and `plan.md` records why the other four came too.
- **`tests/pagination.test.ts`** (24 tests) and **`tests/pagination-guard-coverage.test.ts`** — the
  latter walks `lib/repositories/` from the filesystem with no allowlist and matches the Prisma
  cursor argument on the parsed AST, not by grep, because `pagination.ts`'s own docstring contains
  the literal failing shape and `products.ts` still explains keyset pagination in prose above every
  call site.
- **`specs/architecture.md` 1.27.0 → 1.28.0** — its Pagination section said only that "Prisma
  `cursor` + `take` implements this directly" and nothing about the cursor being untrusted input.

**What the guard is actually fixing, measured live rather than assumed.** All four behaviours below
were reproduced under `npm run preview` against the dev database (2,080 Aheed products) on
2026-09-09, signed in as `demo-store-admin@example.com`:

| Case | Before | After |
|---|---|---|
| `?cursor=not-a-uuid` | 200, "No products", **0 rows** | 200, 25 rows |
| `?cursor=` well-formed uuid naming no row | 200, "No products", **0 rows** | 200, 25 rows |
| `?cursor=<id>&cursor=<id>` (repeated param) | **500** `PrismaClientValidationError` | 200, 25 rows |
| `?category=A&cursor=<cursor from B>` | 200, 25 rows | 200, 25 rows |

The **first two are the important ones and neither is an error**: Prisma returns an empty result
for a cursor that matches nothing rather than throwing, so a stale bookmark rendered the owner's
entire catalogue as empty with nothing anywhere indicating why. That is a far better fit for the
report "an error after browsing or searching through several categories" than the issue's own
first hypothesis.

The third is why `keysetCursorArgs` takes `string | string[] | undefined` rather than the
`string | undefined` the pages declare: a repeated query parameter is `string[]` at runtime
whatever the `searchParams` annotation says, and `cursor: { id: ["x","y"] }` reached Prisma. The
exact logged error was `PrismaClientValidationError` naming `cursor: { id: [ "x", "y" ] ~~~~~ }`.

**The fourth row is `#682`'s named hypothesis and it does not reproduce** — a cursor carried across
a category filter change worked correctly before this slice and works correctly after it.

### Part B — per-request memoisation

- **`lib/tenant.ts`** — `getCurrentVendorIdOrNull` wrapped in React `cache()`. Its docstring
  previously said per-request `cache()` was "intentionally omitted"; that reasoning assumed
  repository-level memoisation was sufficient, but it is per *instance* and about twenty service
  factories each carry their own `vendorIdPromise ??= getCurrentVendorId()`.
- **`lib/categories-service.ts`** — `listCategoriesForAdmin` memoised (keyed on `vendorId`), and
  two new module-scope `cache()`d functions back `listTopLevel`/`listTree`. They are at module
  scope deliberately: `getCategoryRepository()` returns a fresh object per call, so a factory-local
  memo only de-duplicates within one instance, which is the bug rather than the fix.

**Measured: one render of `/staff/products` went from 28 outbound round-trips to 24.** Counted with
no instrumentation at all — `PrismaNeonHttp` is fetch-based, so every Prisma query is one `fetch`
span in `wrangler dev`'s local observability store. The query that produces this, which Validate
can re-run:

```
POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query
{"sql":"select trace_id, sum(case when kind='fetch' then 1 else 0 end) as fetches,
        min(start_ms) as t from spans where start_ms > <epoch_ms_before_request>
        group by trace_id order by t desc limit 5"}
```

The saving is vendor resolution. `/staff/products` calls `listCategoriesForAdmin` exactly once, so
the category memo saves nothing *on that page* — it pays off on pages that build two repositories.
`/search` measured 20 fetches after the change; there is **no pre-slice `/search` baseline**, so
that number is a starting point for future work, not evidence of an improvement.

### Part C — the ordered index

- **`prisma/schema.prisma`** — `@@index([vendorId, createdAt, id])` on `Product`.
- **`prisma/migrations/20260909140355_p9_3_product_created_at_index/`**.

`EXPLAIN (ANALYZE, BUFFERS)` on the admin list query against the dev database, before and after:

```
BEFORE  Limit (cost=168.32..168.39) (actual time=11.986..11.990 rows=26)
          Sort  Sort Key: "createdAt" DESC, id DESC
                Sort Method: top-N heapsort  Memory: 31kB
            Seq Scan on "Product" (actual time=0.849..11.431 rows=2080)
              Buffers: shared read=83 dirtied=19
        Execution Time: 12.063 ms

AFTER   Limit (cost=0.28..4.71) (actual time=0.043..0.053 rows=26)
          Index Scan Backward using "Product_vendorId_createdAt_id_idx" (rows=26)
            Buffers: shared hit=1 read=2
        Execution Time: 0.109 ms
```

R20 deliberately did **not** require the planner to choose the index. It chose it.

### Also updated

- **`CLAUDE.md`** — vitest baseline `115/1520` → **`117/1544`**, and a new paragraph in the running
  history noting that `tests/tenant.test.ts` passed unchanged despite this slice rewriting the
  function it covers.
- **`ARTIFACT_INDEX.md`** and **`app/(admin)/staff/runbook/docs.ts`** regenerated
  (`npm run kms:build-index`), stale because `architecture.md`'s front-matter changed and this
  slice adds a `plan.md`.

## Decisions taken during the build

**`runKeysetPage` re-queries after the fact instead of validating before.** R6 needs a well-formed
id naming no row to render page one, and a syntactic check cannot know whether a row exists.
Deciding it in advance means an existence check on every paginated request — one extra round-trip
on the happy path, in a slice whose other half exists to remove round-trips. Deciding it afterwards
costs nothing on the happy path and one extra query only when the page would otherwise have been
blank. Rejected: an existence pre-check, and putting `(createdAt, id)` into the cursor itself
(structurally the right answer, explicitly out of scope in `plan.md`, tracked as `#664`).

**The fallback only fires when a cursor was actually applied.** Otherwise `?q=zzzzznomatch` would
retry and show unrelated products. Verified live: that query still correctly renders zero rows.

**The UUID pattern is not pinned to version 4 or the RFC variant nibble.** `prisma/seed.ts` writes
hand-authored ids such as `a4ed0000-0000-4000-a000-000000000001`, and a stricter pattern would
reject a legitimate cursor — which fails *closed*, to page one, and is therefore silent. The loose
shape still rejects everything the guard exists for.

**`getBySlug` and `suggest` were deliberately not memoised.** They take arguments and are called
once per render today; an argument-keyed cache would be speculation, not a measured saving.

**Applied the migration with `prisma migrate deploy`, not `migrate dev`.** `migrate dev` wants to
reset a drifted dev database (`#378`); `deploy` applies exactly the committed SQL.

## Deviations from the spec

**Three, all recorded rather than absorbed.**

1. **`keysetCursorArgs` takes `string | string[] | undefined | null`, where R1 says
   `string | undefined`.** Widened because the runtime type genuinely is `string[]` for a repeated
   query parameter, which is the 500 above. R1's intent — reject anything that is not one
   well-formed id — is met more completely this way, not less.

2. **`runKeysetPage` is an addition R1 does not describe.** R1 specifies one function; R6 could not
   be satisfied by it. Rather than reword R6 to match what a syntactic guard can deliver, the
   implementation grew a second, small export. R6 now genuinely passes live.

3. **`validation.md`'s R18 row was corrected during Build.** It said
   `grep -c "DROP INDEX" ... returns 0`. On the *correct* migration that returns **4**, because the
   file's comment block quotes the three statements it removed. Now anchored to
   `grep -cE '^\s*DROP INDEX'`, which returns 0. This is the self-matching-grep trap `CLAUDE.md`
   already records for `"use server"` and `focus:outline-none`; the requirement is unchanged, only
   the way it is checked.

**Not a deviation, but out of scope and filed:** duplicated `status`, `q` and `category` still
return **500** on `/staff/products` — same root cause (declared `string`, runtime `string[]`), but
`parseStaffProductsQuery`'s territory rather than the cursor's. Reproduced live and filed as
**`#689`**. The double `getSession` that `#670` part 2 also names is filed as **`#690`** so it is
not lost when `#670` closes.

## Known-shaky areas

**`#682` is not proven fixed, and must not be closed as though it were.** Its reported error was
never reproduced in the form the issue describes. What this slice fixes are two real, live-measured
defects on the same page, one of which (a silently empty catalogue) is a plausible match for the
report and one of which (a hard 500 on a repeated parameter) is a plausible match for "an error".
If the owner can still reproduce it after this ships, the next step is the `ErrorEvent` row or
`/staff/errors` in **production** — not another local hypothesis. Nothing here queried the
production database.

**R12 is verified structurally, not by decomposed measurement.** The observability `spans` table
records fetch spans with **empty `attributes`**, so there is no URL or statement to classify a
query by. The 28→24 total is real and re-runnable; "exactly one `Category` query per accessor" rests
on `cache()`'s semantics plus the code shape, not on a counted figure. Decomposing it would need
temporary `console.log` instrumentation and a rebuild, which was not added.

**`cache()` outside a React render was the risk going in, and it held — but check R14 first if
anything auth-related looks wrong.** `getCurrentVendorIdOrNull` is called from Better Auth's
route-handler context (`lib/auth.ts:108`), which is not a render. Live result: sign-in returns 200
and repeated wrong passwords still produce `401 401 401 401 429 429 429`, so `#469`'s fail-closed
rate limiter is intact. **`tests/auth.test.ts` cannot catch a regression here** — it mocks
`@/lib/tenant` wholesale, so its `authOnRequest` assertions pass whether or not the real function
works in that context.

**The `runKeysetPage` fallback changes what the last page does.** A cursor pointing exactly past
the end of a list now renders page one rather than an empty page. That is right for a stale
bookmark and arguable for someone paging off the end, though no rendered "next" link can produce
it (`hasMore` is false there). Pagination integrity itself was checked: page 1 and page 2 of a real
category share **zero** product ids.

**Nothing exercised a second vendor.** SriMart has 3 products and its own categories; every live
check above ran against Aheed. The vendor hosts in this dev database are `localhost:8787` and
`srimart.localhost` — **not** the `nocaped.com` convention, so read them from `VendorDomain` before
writing any `curl -H "Host: ..."` command.

**The migration's three removed `DROP INDEX` statements.** GAP-011 fired for the seventh
consecutive time. They were removed by hand and never applied — all four indexes
(`Order_orderNumber_trgm_idx`, `Order_guestEmail_trgm_idx`, `User_email_trgm_idx`,
`Product_vendorId_createdAt_id_idx`) were confirmed present in `pg_indexes` afterwards. Worth
re-confirming on staging after deploy, since that database has not had this migration applied yet.
