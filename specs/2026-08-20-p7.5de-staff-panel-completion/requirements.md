# P7.5d+e — Staff panel completion (requirements / acceptance criteria)

P7.5's final slice, combining P7.5d (#264) and P7.5e (#265). It closes five staff-panel gaps —
#163 (order search is an unindexed scan), #169 (no product search), #136 (loyalty tiers are
edit-only), #160 (no customer directory), #161 (no non-sales reports) — and with them the phase epic
**#260**. Narrative, rationale and the deliberately-excluded list are in `plan.md`; read it before
judging whether a requirement below is the right one. Build order is fixed: **#163 first**, because
it is the only item carrying production-migration risk and must not gate the four assembly items.

Throughout, "the current vendor" means the vendor resolved from the request host by `lib/tenant.ts`,
and "an admin" means a signed-in user for whom `requireVendorRole("ADMIN")` returns `ok`.

## #163 — order search stops being an unindexed scan

R1. A migration directory `prisma/migrations/<timestamp>_p7_5de_order_search_trigram/` exists whose
    `migration.sql` contains both `CREATE EXTENSION IF NOT EXISTS pg_trgm` and at least one
    `CREATE INDEX` using `gin` with `gin_trgm_ops`, covering `Order.orderNumber` and
    `Order.guestEmail`.

R2. That `migration.sql` contains a comment stating explicitly which objects Prisma's schema
    language cannot express and why, as the P7d (#218) hand-authored-DDL exception requires; and
    `prisma/schema.prisma` carries a comment on `model Order` naming that migration as the owner of
    the trigram indexes, so a future `prisma migrate diff` drift report is traceable to a decision.

R3. `npx prisma migrate deploy` exits 0 against the dev Neon branch, and `npx prisma migrate status`
    then reports no pending migrations.

R4. The trigram index is usable by the search predicate: with `enable_seqscan` disabled for the
    session, `EXPLAIN` of an `ILIKE '%term%'` query against `Order.orderNumber` names the new
    trigram index. (Planner *choice* on a small table is not evidence either way; this requirement
    checks the index can serve the predicate at all.)

R5. `/staff/orders?q=<term>` with a term of 3 or more characters returns exactly the current
    vendor's orders whose `orderNumber`, `guestEmail`, or owning user's `email` contains that term
    case-insensitively — the same set a direct Prisma query with the same predicate returns.

R6. `/staff/orders?q=<term>` with a term of one or two characters returns correct results. Trigram
    indexes cannot accelerate a term shorter than one trigram; this requirement is about
    correctness, not speed.

R7. Order search remains vendor-scoped: signed in as an admin of vendor A, a term that matches only
    an order belonging to vendor B returns zero rows.

R8. No raw SQL is introduced into `app/`, `features/`, `components/` or `lib/repositories/*`. The
    hand-authored DDL of R1 lives only in the migration.

## #169 — `/staff/products` gains search and a status filter

R9. `app/(admin)/staff/products/page.tsx` accepts `q` and `status` search params in addition to
    `cursor`.

R10. `/staff/products` renders a `GET` form containing a text input named `q` and a status control
     named `status`, and the page module contains no `"use client"` directive — matching
     `/staff/orders`' progressive-enhancement pattern.

R11. Searching returns exactly the current vendor's products whose `name` contains the term
     case-insensitively; the status control filters on `Product.isActive`, with an explicit
     "all" option that applies no status filter.

R12. The next-page link carries the active `q` and `status` values, so paginating past page one does
     not silently widen the result set.

R13. `listProductsForAdmin` in `lib/repositories/products.ts` still takes `vendorId` as an explicit
     parameter and the module still imports none of `getCurrentVendorId(`, `headers(`, or
     `getAuth(` — it remains a pure, script-loadable repository function.

R14. Product search is vendor-scoped: a term matching only another vendor's product returns zero
     rows.

## #136 — loyalty tiers become creatable and deletable

R15. `/staff/loyalty` renders a control that creates a tier. Submitting a valid `key`, `name`,
     `thresholdPence` and `multiplierBps` creates exactly one `VendorLoyaltyTier` row for the
     current vendor, and the new tier appears on the page after redirect.

R16. Submitting a `key` that already exists for the current vendor creates no row and renders a
     visible error message naming the conflict — the `@@unique([vendorId, key])` constraint is
     reported, never surfaced as an unhandled 500.

R17. The same `key` string remains creatable for a *different* vendor, proving the uniqueness check
     is scoped rather than global.

R18. `/staff/loyalty` renders a delete control per tier. Deleting removes exactly that one
     `VendorLoyaltyTier` row and no other tier row for the vendor.

R19. Deleting a tier whose `key` appears in `LoyaltyLedgerEntry.tierKey` leaves the ledger untouched:
     the row count for that vendor is unchanged and the affected rows' `tierKey` and `multiplierBps`
     values are byte-identical to their values before the delete.

R20. The rendered HTML of `/staff/loyalty` contains no form element nested inside another form
     element. Create and delete controls bind to their own top-level forms via the `form="<id>"`
     attribute, per the P7a (#162) pattern.

R21. `/staff/loyalty`'s `requireVendorRole` refusal branch renders `<PanelRefusal>` rather than
     hand-rolled markup, matching every other `/staff/*` page.

R22. Every `"use server"` file under `features/` exports only async functions — no constants, no
     objects — so no action in those files can 500 at dispatch.

R23. Tier create and delete are refused for a signed-in non-admin: the actions themselves re-check
     `requireVendorRole("ADMIN")` and make no write when it fails.

## #160 — customer directory

R24. A route `/staff/customers` exists and returns HTTP 200 for an admin of the current vendor.

R25. The page lists each person who has placed at least one revenue-status order
     (`REVENUE_STATUSES` from `lib/order-status.ts`) with the current vendor, showing for each: a
     display identity, order count, total spend in pence rendered as GBP, and current loyalty points
     balance.

R26. Guest orders (`userId` null, `guestEmail` set) and erased users (`userId` null after P7b
     erasure) both appear rather than being dropped, and two distinct guest emails are never merged
     into one directory entry.

R27. The directory is offset-paginated, ordered by total spend descending, with a next-page link
     that returns the following page with no duplicate or missing entries. **Corrected at Validate
     (2026-08-20) from an original "keyset-paginated" wording**: a customer here is a `groupBy`
     aggregate over orders, keyed on the nullable `(userId, guestEmail)` pair the grouping is done
     on — not a row with a stable unique id to key on, and spend-ordering has no tiebreak column
     either. Keyset paging over that aggregate is expressible only as raw SQL, which
     `lib/repositories/*` forbids. The requirement's actual intent — page two disjoint from page
     one, no duplicates — is unaffected and was verified live against real data (31 customers
     across a 25+6 page split).

R28. The directory is vendor-scoped: a customer who has ordered only from vendor B does not appear
     for an admin of vendor A.

R29. `/staff/customers`' refusal branch renders `<PanelRefusal>`; a signed-in non-staff user sees
     that refusal, not a blank content area.

R30. `/staff` links to `/staff/customers`, so the page is reachable without typing a URL.

R31. `/staff/customers` is served with `Cache-Control: private, no-store, must-revalidate`,
     inheriting P7.5a's `/staff/:path*` rule in `next.config.mjs`. A directory of named customers,
     their spend and their contact emails is the strongest case on the panel for never being held by
     an intermediary; this requirement exists so the inheritance is proven rather than assumed.

## #161 — non-sales reports

R32. `/staff/reports` renders a catalogue and stock health section showing, for the current vendor:
     total products, count active, count out of stock (`Inventory.quantity` of 0), and count at or
     below `Inventory.lowStockThreshold`.

R33. `/staff/reports` renders a loyalty liability section showing outstanding points and their pence
     value, computed via `visibleBalance()` from `lib/loyalty.ts` and
     `pointsToPence(points, config.pencePerPointRedeemed)`.

R34. Liability excludes lapsed points: an account whose `lastActivityAt` is older than
     `VendorConfig.pointsExpiryMonths` contributes 0, while for a vendor whose `pointsExpiryMonths`
     is null no account lapses and every balance counts. Both branches are exercised.

R35. `/staff/reports` renders a discount configuration section listing the current vendor's discount
     codes with, for each, redemptions used and `remainingRedemptions` (rendered as unlimited when
     null).

R36. No sales analytics is added to `/staff/reports`: the only revenue figures that page renders
     remain P7.5a's three existing tiles, and no new aggregate over `Order.totalPence` grouped by
     time, product or customer appears on it. **Scoped to `/staff/reports` at Validate (2026-08-20)
     from an original "anywhere in this slice" wording**, which contradicted R25: the customer
     directory's required per-customer total spend (R25) is itself a `groupBy`-by-customer
     aggregate over `Order.totalPence`, and is not sales analytics in the sense this requirement
     guards against (revenue trends, best-sellers, time-period breakdowns). Verified
     `/staff/reports` still renders exactly the three pre-existing tiles and nothing more.

## Cross-cutting

R37. The `#252` non-compliant-facade list does not grow: no new function that calls
     `getCurrentVendorId()` is added inside `lib/repositories/*`, and the allowlist in
     `tests/repository-vendor-scoping.test.ts` is unchanged from its state on `origin/main`.

R38. `specs/roadmap.md`'s change log gains the row for **PR #285** that `npm run sdd:audit` reports
     as pending carry-forward, citing the PR number and merge SHA.

R39. `CLAUDE.md`'s staff-panel rule names `app/(admin)/layout.tsx` as the portal shell, correcting
     the non-existent `app/(admin)/staff/layout.tsx` path it currently gives.

R40. `npm run kms:assemble:internal` succeeds and the internal docs site builds
     (`cd kms/site-internal && npx next build --webpack`) — no bare `<` followed by a digit reaches
     MDX from this slice's `docs/` or `specs/` changes.

R41. The PR body's closing keywords close **only** #264, #265, #160, #161, #169, #163, #136 and
     #260. It must not close #252, #269, #253, #254, #243, #244, #246, #236, #113 or #46.

R42. `CHANGELOG.md` updated on the branch before merge (Gate 4).

R43. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
