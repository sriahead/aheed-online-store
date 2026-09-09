---
id: p9-3-admin-catalogue-latency-and-cursor-safety-plan
title: "Admin catalogue latency and cursor safety (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-09
visibility: internal
summary: Guards the unvalidated keyset cursor behind a store-owner error report on /staff/products, collapses per-request vendor and category re-resolution into React cache(), and adds the ordered Product index the list ordering has never had.
tags: [p9-3, catalogue, pagination, latency, prisma]
related: [architecture, roadmap]
---

# Admin catalogue latency and cursor safety (plan)

**Goal:** close the two halves of a store-owner report (`#682`) and the two parts split out of
`#503` (`#670`). Shipping this proves three things: that a cursor arriving from a URL can no longer
reach Prisma unvalidated on any list in the repository; that one render resolves the current vendor
once rather than once per service; and that the ordering every product list uses has an index
behind it.

## Why these are one slice

`#682`'s second half **is** `#670`'s part 2. The store owner reported two things on 2026-09-09 —
an error on `/staff/products` after browsing through several categories, and repeated database
calls for category data — and `#670` had already filed the second of those as a split from `#503`.
Building them separately would mean two slices editing `lib/categories-service.ts` and
`lib/tenant.ts` in the same week.

**This slice proceeds past a written sequencing note, deliberately.** `#670` says *"#439 should run
before part 2 is built… part 2 is a candidate remediation, not an independently justified change."*
That was true when part 2 was a speculative LCP fix. `#682` is a user-reported defect that asks for
exactly this change, which supplies the independent justification `#670` said it lacked. The gate
is satisfied on its own terms rather than overridden.

## Scope (this slice)

### Part A — the cursor is unvalidated on every list in the repository

`app/(admin)/staff/products/page.tsx:41` destructures `cursor` from the query string and passes it
to `listProductsForAdmin` at line 66. Every other input on that page — `status`, `q`, `category` —
goes through `parseStaffProductsQuery`, which documents a deliberate "absent, blank, unrecognised,
forged or cross-vendor all land in the same place" rule for each. `cursor` goes from the raw URL
into `prisma.product.findMany` at `lib/repositories/products.ts:1527` with no existence check and
no check against the `where` it is being applied under.

The asymmetry is sharper than `#682` records: the storefront **search** path already guards its own
cursor at `lib/repositories/products.ts:691` (`parseSearchOffset`), with a comment that says
*"a cursor arrives straight from a URL a shopper may have edited, bookmarked or truncated."* That
reasoning was never carried to the keyset paths.

**There are five unguarded sites, not one** — `findPage` (`products.ts:508`, every storefront browse
and category listing), `listInventoryForStaff` (`products.ts:1450`), `listProductsForAdmin`
(`products.ts:1527`), and two in `lib/repositories/orders.ts` (`:972`, `:1046`). All five are the
identical one-line idiom. Fixing one and leaving four is the exact failure this repo has already
paid for with `PanelRefusal`, where a prose list of compliant pages was wrong in two directions at
once and the fix that actually held was a filesystem-walking test. So this slice routes all five
through one pure helper and adds a test that fails if a sixth appears.

**What the guard cannot decide up front.** `#682`'s named hypothesis is "a cursor produced under one
filter and applied under another" — a *well-formed, real* product id that the current `where`
excludes. Whether Prisma's client-side query compiler errors, returns empty, or silently ignores
that is not documented anywhere this project can rely on, and `CLAUDE.md` records two separate
occasions (`isUniqueViolation`'s `P2002`/`23505`, Workers AI's `result.response`) where a
hand-written test double reproduced the shape its author assumed rather than the shape the real
system produces. So R7 requires a **live experiment against a real database** before the
implementation is finalised, and R5/R6 state the required *observable outcome* rather than a
mechanism, so they stay checkable whichever way the experiment lands.

### Part B — one render resolves the vendor once

`lib/tenant.ts:5-9` documents the omission of a per-request React `cache()` as intentional. The cost
is larger than that comment assumes: **roughly twenty service factories** each carry
`vendorIdPromise ??= getCurrentVendorId()`, memoising per *service instance*, so every service
constructed during one render re-resolves the same immutable value. `#503` measured the economics —
every query on the path is under 2 ms while one Neon round-trip costs about 69 ms, so the latency is
round-trip *count*.

The risk worth naming is whether React `cache()` behaves outside a component render on this stack,
given `lib/vendor-service.ts:40` deliberately avoids it inside a Better Auth callback.
**That is largely already answered**: `getPrisma`/`getPrismaWs` are themselves `cache()`-wrapped
(`lib/db.ts:10,21`), and `authOnRequest` calls `getPrisma()` on the live rate-limit path today, in
production. If `cache()` failed in route handlers here the app would already be broken. It is still
verified live rather than assumed (R13), because the specific path at risk is `lib/auth.ts:108`'s
fail-closed branch, which `#469` created to close a confirmed exploitable rate-limit bypass.

Category reads get the same treatment: `listCategoriesForAdmin` is called by six admin pages and
`listTopLevel`/`listTree` by four storefront pages, one query per call, memoised nowhere.

### Part C — the list ordering has no index

Every product list orders by `(createdAt desc, id desc)`. `Product` carries seven indexes and none
of them is ordered by `createdAt`; `Order` already has `@@index([vendorId, createdAt])`. `#503`'s
`EXPLAIN (ANALYZE, BUFFERS)` showed `Seq Scan` plus `top-N heapsort` over all 2,026 rows on every
list page. `specs/architecture.md:622` already states the rule this violates: *"Every list is
keyset-paginated; every hot query has an index shipped in the same migration."*

`@@index([vendorId, createdAt, id])` on `Product`, generated from the schema declaration so no
hand-authored DDL is involved and the schema stays the source of truth.

**The cost, stated up front rather than discovered:** this is the only part needing a migration, and
`CLAUDE.md` records that `prisma migrate dev` has generated a spurious `DROP INDEX` against the three
hand-authored `pg_trgm` indexes on **every** migration this project has produced since `#508` — six
occurrences, certain rather than possible. `--create-only` followed by reading the generated SQL is
the procedure here, not a precaution (R17).

## Deliberately excluded

- **Cross-request caching of category data.** The store owner's report asks to "cache category data
  and refresh/invalidate when categories change". Per-request memoisation needs no invalidation and
  is what every other read on these pages already uses; a cross-request cache needs invalidation and
  lands directly on the rule `CLAUDE.md` records as having cost this project real production errors
  (`Cannot perform I/O on behalf of a different request`). `#682` itself recommends doing the
  per-request half now and treating any cross-request cache as its own decision. R15 pins that.
- **Better Auth `session.cookieCache`.** It would remove the double `getSession` round-trip
  (`components/layout/Header.tsx:76` and `app/(storefront)/products/[slug]/page.tsx:28`) but caches
  role claims in a signed cookie for a TTL, so a revoked staff role stays live until it expires.
  `#670` excludes it explicitly as a trade-off deserving its own decision on an RBAC surface. The
  double `getSession` is left in place rather than half-solved.
- **Rewriting keyset pagination to carry `(createdAt, id)` in the cursor.** That is the structurally
  complete answer to an unresolvable cursor and it would pair naturally with Part C's index, but it
  changes `findPage`'s contract for every storefront list and `#664` already tracks making that
  cursor sort-key aware. Out of scope here.
- **A storefront sort control** (`#664`) and **the variant/unit-of-measure model** (`#663`).
- **`#439`'s LCP re-measurement.** Part B is justified by `#682` rather than by an LCP measurement;
  this slice does not pre-empt `#439`, and its own measurement (R12) is a round-trip count on the
  admin path, not a Core Web Vitals number.

## Open items carried forward

- **`#595`** (the suggest route resolves the vendor twice per request) is fixed incidentally by
  Part B. It is not claimed as scope; R12's measurement will show whether it can close, and any
  PR referencing it must use a bare digit with no closing keyword — this repo has hit the
  `closingIssuesReferences` trap three times, most recently auto-closing `#670` itself on 2026-09-08.
- **`#682`'s reported error may not be the cursor.** If R7's experiment does not reproduce it, the
  slice ships the guard on its own independent merit and says plainly that the report is still
  unreproduced. `#682` does not close on assertion; R7 requires the outcome either way to be
  recorded in `build-notes.md`.
- **`#513`** — the delivery board's Phase field has no P9 option, so `#682` and `#670` sit on the
  board with Phase unset. Not papered over with a wrong value.
