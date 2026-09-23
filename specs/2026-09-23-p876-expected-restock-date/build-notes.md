# P876 — Expected Restock Date on Out-of-Stock Products (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

Built in the **main checkout** (no worktree), on branch `feature/876-expected-restock-date`, cut from
`staging` at `41e86dc`. Commits, in order:

| Commit | What |
|---|---|
| `066a23f` | Spec (plan, requirements, validation) plus regenerated `ARTIFACT_INDEX.md`/`docs.ts` |
| `1229292` | Spec correction: validation row R10's timezone runs (see Deviations) |
| `d41f2c3` | The whole feature **except** R2. `createProductForVendor` still on `getPrisma()` here, deliberately |
| `1261c43` | R2: `createProductForVendor` moved to `getPrismaWs()` (#878) |
| (this commit) | Build notes, CHANGELOG, persistent docs |

## What changed and why

**Schema and migration.** `prisma/schema.prisma` `Inventory.expectedRestockDate DateTime?`, with a
comment naming the #811 convention (UTC midnight of the vendor-local day). The migration
`prisma/migrations/20260923103000_p876_inventory_expected_restock_date/migration.sql` is one
`ALTER TABLE "Inventory" ADD COLUMN "expectedRestockDate" TIMESTAMP(3);` with no `DROP`. It is
**applied to the dev database** (`ep-dry-morning-zab7dx08`, see Known-shaky) via
`npx prisma migrate deploy`; staging and production get it through the deploy workflows on merge.

**`lib/restock.ts` (new, pure, client-safe).** `restockDayFromStored(Date)` gives the stored instant
back as its `YYYY-MM-DD` label (via `toISOString().slice(0,10)`, correct because the stored value
*is* a UTC midnight). `currentRestockDay(day, today)` compares plain strings. `formatRestockDay(day)`
uses `Intl.DateTimeFormat("en-GB", …, timeZone: "UTC")`. Real output: `2026-09-28` becomes
`Mon 28 Sept` (ICU's en-GB month is "Sept", which is why the spec didn't pin the month), and
`2026-12-01` becomes `Tue 1 Dec`.

**Form and parser.** `lib/catalogue-form.ts`: `ProductFormValues.expectedRestockDay: string | null`.
The key is added to `PRODUCT_FIELDS` (without it `readForm()` never reads the field, the trap that
list's comments already warn about). Validation uses `calendarDayToUtcMidnight` from
`lib/local-datetime.ts` (rejects `2026-02-31` instead of rolling it over), with the error on field
`expectedRestockDay`. `components/staff/ProductForm.tsx` adds a labelled `type="date"` input after
the low-stock threshold, with a hint paragraph linked by `aria-describedby`. When the field is
invalid, it points at both the hint and `product-form-error`, overriding `fieldProps`'s own value.

**Repository (`lib/repositories/products.ts`).**
- `ProductSummary`, `AdminProductDetail` and `ProductWriteInput` each gain the field.
- The field is mapped in `toProductSummary` (via `productSummarySelect`), `getProductBySlug` and
  `getProductForAdmin`. Each only adds `expectedRestockDate: true` to the inventory `select` it
  already had, so there are no new queries.
- A private `toRestockDate(day)` feeds the nested create in `createProductForVendor` and both
  branches of the `inventory.upsert` in `updateProductForVendor`.

**Facade (`lib/products-service.ts`).** `vendorToday()` = `calendarDayInZone(new Date(),
getCurrentVendorProfile()?.timezone ?? STORE_TIMEZONE)`. `withCurrentRestock` /
`withCurrentRestockPage` apply `currentRestockDay` in `list`, `listByCategory`, `search` and
`getBySlug`. R2 also lives here: `createProductForVendor` moved below the transaction-bearing
banner and now takes `getPrismaWs()`.

**Display.** New `components/product/RestockNotice.tsx`, a hook-free component with a
`CalendarClock` icon and `text-primary`. It's used by `ProductCard` (below the low-stock line), by
`QuickViewDrawer` (beside `Out of stock`), and by `app/(storefront)/products/[slug]/page.tsx` (after
the `Out of stock` paragraph). Each call site owns the condition `!inStock && expectedRestockDay !==
null`.

**Docs.** `docs/staff-playbook/staff-tabs-guide.md` 2.3.0 → 2.4.0:
- the Catalogue section documents the field and both display conditions;
- the Live Inventory workflow now says to set zero plus a restock date for an item that is coming
  back, and to switch it off only for one that isn't.

**Tests.**
- New: `tests/restock.test.ts` (9 cases) and `tests/restock-notice.test.tsx` (ProductCard's three
  R12 cases, plus QuickViewDrawer's present and day-null cases for R13).
- `tests/catalogue-form.test.ts` gains R7's three cases.
- Fixtures gained `expectedRestockDay: null` in `tests/product-card-stretched-link.test.tsx`,
  `tests/quick-view.test.tsx`, `scripts/verify-repository-injection.ts` and
  `scripts/verify-unit-price-sort.ts`.
- `tests/products-service.test.ts` gains a `@/lib/vendor-service` mock (see Decisions).

Full `npx vitest run` alone: **162 files, 2,142 tests, exit 0**. `lint`, `typecheck` and
`format:check` exit 0. `kms:validate` shows 0 failing. `kms:assemble:internal` plus
`kms/site-internal`'s `next build --webpack` exit 0.

## Decisions taken during the build

- **One shared `RestockNotice` component**, not three inline copies. Three surfaces must say the
  identical sentence, and the spec's R12–R14 all assert the same text. Sizing is passed per surface
  (`text-[11px]` card, `text-xs` drawer, `text-sm` page), matching each surface's existing low-stock
  and stock typography.
- **`text-primary` for the notice**, not `text-danger` like the low-stock line. It's reassurance,
  not urgency, and `text-primary` is the token `brandStyle()` clamps to 4.5:1 per vendor. No alpha
  modifier (#649).
- **The hint text uses `text-black/60`**, which #649's audit measured at 5.74:1 (passes AA). It's
  the same class the form's existing hint paragraphs use.
- **The migration was generated with `prisma migrate diff --from-schema-datamodel <HEAD schema>
  --to-schema-datamodel prisma/schema.prisma --script`**, not `migrate dev --create-only`. At the
  time the dev database's credentials were rejected, and a datamodel-to-datamodel diff needs no
  database. It honours the rule's intent more strictly: the `pg_trgm` indexes are in neither
  datamodel, so the diff *cannot* propose dropping them. I read the SQL before committing. The
  directory timestamp `20260923103000` was chosen by hand to sort after the newest existing
  migration (`20260919155910_p818_…`).
- **`tests/products-service.test.ts` mocks `@/lib/vendor-service`** (`getCurrentVendorProfile` →
  `{ timezone: "Europe/London" }`). The facade now calls it, and that test's partial `@/lib/tenant`
  mock lacks `getCurrentVendorIdOrNull`, so both of its query-log tests failed. That file tests
  search query logging, not tenancy, so a fixed profile is the honest mock.
- **`vendorToday()` is recomputed per facade call, not memoised.** `getCurrentVendorProfile()` is
  already `React.cache`d, so the only repeated work is one `Intl` call.

## Deviations from the spec

- **Validation row R10 was corrected mid-build (commit `1229292`, spec-only).** As written it ran
  the tests under `TZ=Pacific/Pago_Pago` and `TZ=Pacific/Kiritimati`. On this Windows machine a `TZ`
  containing a slash is silently dropped (`docs/developer-portal/local-dev-playbook.md`). I measured
  it: `TZ=Pacific/Pago_Pago node -e "…getTimezoneOffset()"` printed `0`, and so did the POSIX string
  `JST-9`. Both runs would have passed vacuously. The row now uses `TZ=NZ` (UTC+12) and
  `TZ=PST8PDT` (UTC−7), both measured to take effect, and tells the validator to confirm the offset
  first. The tests pass under both.
- No requirement text changed. Nothing else deviates.

**R1 evidence (the reproduction R1 requires, recorded verbatim):**

- **Setup:** HEAD `d41f2c3` (create still on `getPrisma()`), `npm run preview` against dev
  `ep-dry-morning-zab7dx08` with this slice's migration already applied (otherwise the new column
  would have failed first and masked the #878 behaviour). Signed in as `demo-staff@example.com`.
  2026-09-23 11:09:10 UTC.
- **Request:** `POST /staff/products/new` with name `P876 R1 probe prefix`, slug
  `p876-r1-probe-prefix`, category Bread & Loaves, quantity `0`, restock day `2026-12-01`.
- **Result:** HTTP **500**. The Worker's captured console, read through
  `/cdn-cgi/local/explorer/api/local/observability/query` over `logs`, shows:
  `Error: Transactions are not supported in HTTP mode`, and
  `Unhandled request error: … "path":"/staff/products/new" … "clientVersion":"6.19.3"`.
- **Database afterwards:** no `Product` row with that slug.
- **Conclusion:** it **did crash**, confirming `CLAUDE.md`'s nested-create rule rather than
  contradicting it. So the plan's "file a follow-up issue if it doesn't crash" branch did not
  trigger. **Product creation from `/staff/products/new` is broken on every environment until this
  ships.**

## Known-shaky areas

- **The dev database is a new endpoint.** On 2026-09-23 Neon rejected the old dev endpoint
  `ep-sparkling-paper-za3j7xza`'s credentials. The owner switched `.env`/`.dev.vars` to
  **`ep-dry-morning-zab7dx08`** and confirmed it is dev. At the owner's request I then corrected both
  files: `DIRECT_URL` had been set to the `-pooler` host, and both keys had spaces after `=`. Before
  any live row, re-confirm both files name `ep-dry-morning-zab7dx08`, with `DIRECT_URL` on the
  **non-pooler** host.
- **Reading `expectedRestockDate` with `@neondatabase/serverless` from Node misreports it by the BST
  offset.** A `TIMESTAMP(3)` column has no zone, and the driver parses it as local time. In
  September it shows `…T23:00:00.000Z` the day before. The stored value is correct: `::text` reads
  `2026-09-22 00:00:00`, identical in form to existing `Order.fulfilmentDate` rows, and the app
  reads through Prisma, which treats it as UTC. **When checking the column directly, select
  `"expectedRestockDate"::text`.** R3's December date happens to hide this, but R16's (September)
  dates would not.
- **Driving `/staff/products/*` without a browser** follows the playbook's `useActionState` recipe
  (`$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_1:1`, and a fresh `$ACTION_KEY` per submit). Three traps
  hit here:
  - under Git Bash, a `/staff/...` argument to a native program gets rewritten into a Windows path
    unless `MSYS_NO_PATHCONV=1` is set;
  - the category `<select>`'s placeholder option is marked `selected`, so a form scraper sends an
    empty `categoryId` unless it's given one explicitly;
  - `.env`'s `DEMO_ACCOUNT_PASSWORD` line has trailing text after its quoted value, so parse it the
    way `dotenv` does, or sign-in returns 401. (An earlier 401 in this session was that parsing bug,
    not a password mismatch.)

  A browser is simpler if the Chrome extension is available.
- **Leftover dev data from Build:** product `p876-build-smoke` (id
  `b23a3586-d25f-4f05-b970-3069c20cb041`, Bread & Loaves) was created post-fix as a smoke test. Its
  restock day was set to 2026-12-01 (shown on its page as `Tue 1 Dec`), then to 2026-09-22 (hidden;
  the quick-view API returned `"expectedRestockDay":null`), then cleared (the column read back
  `NULL`). It's now **inactive** with no date. `p876-r1-probe-prefix` was never created (the 500).
  Either can be ignored or reused; neither is validation evidence.
- **The facade filter is covered by live checks only, not a unit test.** R11 names four methods. A
  future fifth method returning `ProductSummary` would silently skip the filter. Today only
  `lib/repositories/products.ts` builds `ProductSummary`, and only these four expose it.
- **The quick-view drawer renders from two sources in turn:** the card's `ProductSummary`
  immediately, then `/api/products/quick-view`'s detail once fetched. Both pass through the facade's
  filter (`listByCategory`/`search`/`list`, then `getBySlug`), so they agree. The unit test asserts
  after the fetch resolves.
