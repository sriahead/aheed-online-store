# P7.5d+e — Staff panel completion (build notes)

Written at the end of Build, before the Clear. The validating context is fresh and has only
`plan.md`, `requirements.md`, `validation.md`, the artifact, and this file.

Branch `feature/264-staff-panel-completion`; two commits — `ae88902` (spec) and `60ade8c` (build).

## What changed and why

Built in the spec's fixed order. **#163 first**, because it was the only item carrying
production-migration risk and the whole point of the ordering was that it must not gate the four
pure-assembly items. It landed, so nothing had to be dropped.

### #163 — order search stops being an unindexed scan

`prisma/migrations/20260820143949_p7_5de_order_search_trigram/migration.sql` — the repo's **first
`CREATE EXTENSION`** — installs `pg_trgm` and creates three GIN trigram indexes. **No application
code changed at all**: `staffOrderWhere()` was already correct, just slow, and the index makes the
existing `ILIKE '%term%'` servable. If you are looking for a behavioural diff for #163, there isn't
one, and that is the intended outcome.

The migration carries the disclosure the P7d (#218) hand-authored-DDL exception requires, and
`prisma/schema.prisma` gained a matching comment on `model Order` so the drift is traceable from the
schema side. Both were treated as mandatory, not optional (R2).

**Verified during Build, not assumed:** `npx prisma migrate deploy` applied cleanly against the dev
Neon branch, `pg_trgm` is installed, and all three indexes were confirmed to serve
`ILIKE '%term%'` via `EXPLAIN` with `enable_seqscan = off`. The plan left one question open — whether
the `User.email` relation arm could be index-served at all — and **the answer is yes**: its subquery
uses `User_email_trgm_idx` the same way the two local `Order` columns use theirs.

### #169 — `/staff/products` search and status filter

New `lib/staff-products-query.ts`, a pure module mirroring `lib/staff-orders-query.ts`, plus
`tests/staff-products-query.test.ts` (12 tests). `listProductsForAdmin` gained optional `search` and
`isActive` arguments and stayed a pure function taking `vendorId` explicitly. The page got the same
plain GET form `/staff/orders` uses, and its next-page link now goes through `staffProductsHref()`
so paginating cannot silently widen the result set.

The rule a reader cannot reconstruct from the code: **this module's default is the inverse of the
orders one.** `/staff/orders` narrows to a worklist when no status is given; `/staff/products` must
keep showing *everything, hidden items included*, because P6b1 shipped it that way deliberately — an
owner has to be able to find the product they just switched off in order to switch it back on. An
absent or unrecognised status therefore applies **no** `isActive` filter. Three of the twelve tests
exist only to pin that.

### #136 — loyalty tiers become creatable and deletable

`createLoyaltyTier` / `deleteLoyaltyTier` in `lib/repositories/loyalty.ts` (both taking `vendorId`
explicitly), two new actions in `features/admin/loyalty-config.ts`, and a restructured
`components/staff/LoyaltyConfigForm.tsx`.

The component previously returned a single `<form>`. It now returns a `<div>` holding **three
sibling top-level forms** — config, delete, create. This is forced: HTML forbids nesting forms, and
every tier row lives inside the config form. The per-row Remove button therefore sits in the config
form's DOM but is associated with the delete form by `form="delete-tier"`, carrying the tier key as
its **own** `name`/`value` so one top-level form serves every row. Same technique as `/staff/orders`'
bulk advance (P7a, #162); no client-side JS involved.

`/staff/loyalty`'s refusal branch was converted to `<PanelRefusal>` (R21) while the page was open
anyway.

### #160 — customer directory

New `lib/repositories/customers.ts` and `app/(admin)/staff/customers/page.tsx`, plus a nav card on
`/staff`.

The load-bearing decision: **a customer is derived from vendor-scoped `Order`, never from `User`.**
`User` is global across tenants (ADR-004), so listing it on a vendor's panel would show one vendor
the other's customers. Deriving from orders makes the tenant boundary structural rather than a
filter someone has to remember. Revenue statuses only, for the same reason `/staff/reports` uses
them since #238 — an abandoned unpaid checkout is not a customer and its basket is not spend.

### #161 — non-sales reports

New `lib/repositories/reports.ts` (`getCatalogueHealth`, `getLoyaltyLiability`) and three new
sections on `/staff/reports`. The discount section reuses the **existing** `listCodes` /
`getDiscountRepository().list()` rather than adding a query — it already returned exactly the
`redemptionCount` / `remainingRedemptions` shape R35 asks for.

`getLoyaltyLiability` calls `visibleBalance()` per account instead of aggregating
`SUM(balancePoints)` in the database. That is the whole point of the requirement: the stored column
is deliberately left **stale** after points lapse and only resets on the next `EARN`, so summing it
overstates liability by every lapsed balance — the same class of knowably-wrong aggregate as #238,
the defect P7.5a exists to fix. Reintroducing it one page over would have been the worst possible
outcome of this slice.

### Cross-cutting, on this branch by design

- `specs/roadmap.md` — the **PR #285** promotion row `sdd:audit` reported as pending carry-forward
  at `/orient` (R38). `sdd:audit` now cites it.
- `CLAUDE.md` — the staff-panel rule pointed at `app/(admin)/staff/layout.tsx`, **a file that has
  never existed**; the shell is `app/(admin)/layout.tsx` (R39). The rule's substance was fine but
  its path was unopenable, which is the same failure mode as a ruling nobody can find. The same
  entry now also records `loyalty/page.tsx` as a second `PanelRefusal` instance.
- `ARTIFACT_INDEX.md` — rebuilt via `npm run kms:build-index` so this slice's `plan.md` is indexed.
- `specs/architecture.md` → **1.17.0**. §3.1 said `pg_trgm` was "optional and only via portable
  migrations", which was a hypothetical; it is now installed. The bullet records that, that it is
  still provider-neutral (stock contrib module, not a Neon feature), and the standing consequence
  that `schema.prisma` no longer fully describes the database. This is a persistent-doc change and
  belongs on this branch, not on the post-ship pass.

### Deferred items, filed as issues at Build

- **#286** — storefront fuzzy/typo-tolerant search. Newly *half*-unblocked: every prior deferral
  cited "needs `pg_trgm` + `$queryRaw`", and `pg_trgm` now exists. The query half is still blocked
  (Prisma has no similarity operator), and P2's "wait until the catalogue outgrows placeholder data"
  precondition still stands. Filed so the changed premise isn't lost.
- **#287** — two small defects found and deliberately not fixed: `/staff/reports`' `<h1>` reads
  "Sales & Pence Financials" (and is now additionally inaccurate, since this slice added non-sales
  sections beneath it), and `saveLoyaltySettings` opens with a `const prisma = getPrisma()` it never
  uses.
- **#288** — customer directory follow-ups (detail view, search, and the export question, which is a
  bulk personal-data egress decision rather than a feature).

All three are on Project #2, Phase P8, Backlog.

## Decisions taken during the build

1. **A third trigram index on `User.email`, beyond R1's literal two.** R1 names `Order.orderNumber`
   and `Order.guestEmail`. The search's third arm is `user: { email: ... }`, and indexing only the
   two local columns would have left every account-holder search on exactly the sequential scan
   #163 is about. Recorded as a deviation below rather than slipped in.
2. **`CREATE INDEX`, not `CREATE INDEX CONCURRENTLY`.** Prisma runs each migration inside a
   transaction and `CONCURRENTLY` cannot run in one. The tables are small enough that the brief
   write lock is acceptable; the migration comment says so, and says what to do if `Order` ever
   outgrows it.
3. **`IF NOT EXISTS` on the extension and all three indexes**, so re-running the migration against a
   database that already has them is a no-op rather than an error.
4. **Duplicate tier keys are refused by the database, not by check-then-insert.** `createLoyaltyTier`
   catches P2002 through the **existing** `isUniqueViolation` helper (`lib/repositories/prisma-errors.ts`)
   rather than reading first. `@@unique([vendorId, key])` is the only thing that can decide this
   without a race, and two admins creating `GOLD` at once is a plausible enough sequence not to
   hand-roll. It is also why the same key stays creatable for a different vendor (R17).
5. **Tier `sortOrder` is set to `thresholdPence`** rather than managed separately. `resolveTier()`
   already ranks by threshold, so a separate ordering field would be a second source of truth for
   the same ranking.
6. **A `TIER_KEY_PATTERN` of `^[A-Z0-9_]{2,32}$`, and keys are upper-cased on input.** The key is
   snapshotted onto every `EARN`, so it must not carry spaces or punctuation that would make ledger
   rows awkward to read or match later.
7. **Create and delete are separate actions, not extra fields on `saveLoyaltyConfig`.** Folding them
   in would mean one submit could both edit every tier and delete one, with no way to report which
   half failed.
8. **Erased customers render as a single aggregate row.** P7b's erasure nulls **both** `userId` and
   `guestEmail` on the order, so every erased person's orders collapse into one indistinguishable
   group. Showing one honest "Erased customers" line was chosen over dropping them — those orders
   still count toward store revenue, so a directory that omits them would not reconcile against
   `/staff/reports`.
9. **The directory's loyalty figure also goes through `visibleBalance()`**, matching the liability
   tile rather than showing a raw column two pages apart from each other.
10. **`outOfStock` and `lowStock` are disjoint** — a zero-quantity product is counted as out of
    stock only, never in both. The page says so, so the two figures can be read together.
11. **`lowStock` is computed in memory.** It compares two columns of the same row
    (`quantity <= lowStockThreshold`), which Prisma cannot express in a `where`. Reaching for raw
    SQL was rejected — it is forbidden in this layer and the honest alternative at scale is a
    generated column or a view in a migration, which the module comment records.
12. **Neither new repository module gets a request-scoped facade.** `customers.ts` and `reports.ts`
    export only pure functions taking `vendorId`; the pages pass `auth.vendorId` from
    `requireVendorRole`. This keeps the #252 count at nine (R37) and keeps both modules loadable by a
    plain `tsx` script, which is what several validation rows depend on.
13. **`kms/site-internal/next-env.d.ts` was deliberately not committed.** Running `next build` in
    that directory rewrites its dev-vs-build type paths; it flips back the moment anyone runs
    `next dev` there and is not part of this slice.

## Deviations from the spec

Three, all deliberate; two required a requirements.md correction at Validate (below).

### 1. R27 — the customer directory is OFFSET-paginated, not keyset.

R27 says the directory is "keyset-paginated in the same shape as `/staff/orders` and
`/staff/products`". It is not. It uses `page`-based offset pagination ordered by total spend
descending.

The requirement was written before the aggregate shape was worked out, and it is not achievable as
stated. `/staff/orders` and `/staff/products` paginate **rows**, which have a stable unique `id` to
key on. A customer is not a row — it is a **group** over orders whose identity is the
`(userId, guestEmail)` pair the grouping is done on. Keyset paging over that would mean filtering the
underlying orders by a composite key with nullable members, which is expressible here only as raw
SQL — forbidden in `lib/repositories/*`. Ordering by spend, which is what actually makes the first
page useful to a shop owner, has no unique tiebreak column to key on either.

**This is flagged for a decision at Validate, not quietly reconciled.** Either R27 is amended to
say offset pagination (my recommendation — the reasoning is in the module comment) or the approach
changes. The *observable* intent of R27 — page two is disjoint from page one, with no duplicates —
does hold and is worth checking regardless.

**Resolved at Validate (2026-08-20):** R27 amended to describe offset pagination, per the
recommendation above. The live check (31 customers, a 25+6 page split against real dev data) found
no duplicates and no gaps.

### 2. R36 — contradicted R25, corrected at Validate

R36's original wording ("no new aggregate over `Order.totalPence` grouped by ... customer appears
**anywhere in this slice**") was broader than intended and directly contradicted R25, which requires
the customer directory to show per-customer total spend — itself a `groupBy`-by-customer aggregate
over `Order.totalPence`. Not caught during Build because both requirements were read in isolation
against their own sections rather than against each other. **Resolved at Validate (2026-08-20):**
R36 scoped to `/staff/reports` specifically, matching its actual intent (no sales-trend dashboard on
that page) — confirmed live that the page still renders exactly P7.5a's three revenue tiles.

### 3. R1 — a third index the requirement does not name

R1 requires trigram indexes covering `Order.orderNumber` and `Order.guestEmail`. The migration also
creates `User_email_trgm_idx`. Justification is decision 1 above: the third search arm would
otherwise keep the exact defect #163 was filed for. This *widens* what R1 asked for rather than
narrowing it, and R5's correctness check covers the account-email case either way.

## Known-shaky areas

Ordered by where I would actually look first.

1. **The R27 deviation above.** Read it before running the row.
2. **R4 will mislead you if you skip `enable_seqscan = off`.** The dev database is small enough that
   Postgres will rationally choose a sequential scan over the trigram index. That is not evidence the
   index is broken — R4 is written to check the index *can* serve the predicate, which is the only
   thing provable at this data size. A "Seq Scan" result without disabling seqscan first proves
   nothing either way.
3. **R26 and R33 may have no data to exercise and will need fixtures.** I did not confirm the dev
   branch contains a guest order, an erased order, or a lapsed loyalty account. R26's erased case is
   the least likely to exist naturally. `validation.md` S5 covers creating and restoring these;
   please actually restore them (#273 is the standing example of dev-DB fixture rows outliving their
   slice and giving a later reader a false reading).
4. **The `ERASED` row is the least-exercised path in the directory.** It is reachable only through
   P7b's erasure having run against this vendor's data. If it renders, check it says "Erased
   customers" and still contributes its spend.
5. **`groupBy` with `take: take + 1` and `skip` is the pagination mechanism** and is the part of
   `listCustomersForAdmin` I would distrust first. In particular `hasMore` on the last exact-multiple
   page, and whether `orderBy: { _sum: { totalPence: "desc" } }` gives a stable order across two
   requests when several customers have identical spend — an unstable tiebreak could show the same
   person on both pages, which is exactly what R27's disjointness check would catch.
6. **R17 needs a real second vendor host.** It is the only row proving tier-key uniqueness is scoped
   rather than global. Read the host from `VendorDomain` (S3) — do not assume
   `srimart-staging.nocaped.com`; the hosts are seeded from `SEED_SRIMART_HOST` and the dev branch
   may differ.
7. **Nothing in `lint`/`typecheck`/`test` can catch the R20 nested-form rule.** It is a property of
   rendered HTML. The three forms are siblings by construction, but confirm it against real output.
8. **`format:check` reports 193 files** and this is the documented `core.autocrlf` artifact, not
   drift. I confirmed it the documented way: `git show HEAD:tests/staff-orders-query.test.ts` written
   with LF passes `prettier --config .prettierrc.json --check`, and all five new files pass the same
   check when converted to LF. CI on Linux is the authority.
9. **Migration drift is now a live possibility, by design.** `schema.prisma` cannot describe the
   trigram indexes, so `prisma migrate diff` may report drift that is not drift and `migrate dev` may
   propose dropping them. The migration and the schema comment both say to keep them. If a future
   session reports "unexpected indexes", this is why.
10. **Added at Validate (2026-08-20): `npm run preview`'s local Windows session intermittently
    returned raw 500/503 responses on `POST /staff/loyalty` (create and delete) while the
    underlying write completed correctly every time** — confirmed via direct DB inspection after
    each occurrence (no duplicate row on the R16 duplicate-key case; the GOLD tier genuinely
    deleted with all 11 ledger rows byte-identical for R19). The same symptom hit a non-conflicting
    create and a non-conflicting delete, ruling out the duplicate-key catch itself as the cause, and
    coincided with persistent CDP screenshot timeouts ("renderer may be frozen") in the same
    session — consistent with this repo's already-documented local Windows OpenNext/workerd
    instability (`CLAUDE.md`'s "Local Stripe webhook testing" and "Stopping `npm run preview`"
    entries are the same family of issue). Treated as environment noise, not an app defect; worth a
    spot-check against staging if it recurs.

Green at the end of Build: `lint`, `typecheck`, `npm test` (524 tests, 42 files), `npm run build`,
and the KMS internal site build (`kms:assemble:internal` + `next build --webpack`, 81 pages).
