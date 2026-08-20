---
id: p7-5de-staff-panel-completion
title: "P7.5d+e — Staff panel completion: customer directory, non-sales reports, admin search & tier CRUD (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-20
visibility: internal
summary: P7.5's final slice — combines P7.5d (#264) and P7.5e (#265) into one staff-panel pass closing #160, #161, #169, #163 and #136, and with them the P7.5 phase epic #260.
tags: [p7.5, staff-panel, reports, search, loyalty, closeout]
# related: [roadmap, architecture]
---

# P7.5d+e — Staff panel completion (plan)

**Goal:** close the last five items of P7.5 and with them the phase, so "safe to start P8" is a
statement `specs/roadmap.md` can point at rather than hope. Every item lives on the `/staff/*`
surface; on promotion this closes #264, #265, #160, #161, #169, #163, #136 and the epic **#260**.

## Why d and e are one slice

The epic's own sizing rule says slices are "sized so each survives its own `/validate` pass", and
this combination deliberately cuts against it — recorded here rather than glossed. It was accepted
at Propose for the same reason **P7.5c+f** was combined: all five underlying issues are only
observable through the *same expensive rig* — a demo-admin sign-in against `npm run preview`, driven
for both vendors. Standing that rig up twice is the actual waste. The offsetting risk is that a
failure in one item holds the other four, which is why **#163 is built first** (below).

## Scope (this slice)

Built in this order. The ordering is a requirement, not a preference.

### 1. #163 — order search stops being an unindexed scan (**built first**)

`staffOrderWhere()` (`lib/repositories/orders.ts:702`) ORs three case-insensitive `contains`
predicates — `Order.orderNumber`, `Order.guestEmail`, and the *related* `User.email`. Prisma emits
`ILIKE '%term%'` for each; `Order` carries `@@index([vendorId, createdAt])`,
`@@index([vendorId, status, createdAt])` and `@@index([vendorId, userId, createdAt])`, none of which
can serve a leading-wildcard match. The status filter and ordering are already indexed — the
*search* is what scans.

This is built first because it is **the only item here carrying production-migration risk**, and the
other four are pure assembly. Sequencing it first means it either lands early or drops to its own
follow-up issue without holding them.

Two things make it larger than "add an index":

- **It is the repo's first `CREATE EXTENSION`.** No migration under `prisma/migrations/` contains
  one. Under the P7d (#218) ruling this is permitted as a **deliberate hand-authored-DDL exception**,
  and that ruling attaches a price: a comment in the migration naming what Prisma cannot express,
  and a note in the spec that introduced it. This plan is that note. The cost is real and is being
  paid knowingly — `schema.prisma` will no longer fully describe the database, so
  `prisma migrate diff` can report drift that is not drift, and a future `migrate dev` can propose
  dropping the index. R2 exists to make that discoverable to whoever hits it.
- **A trigram index does not serve the relation filter the way it serves a local column.** The
  `user: { email: ... }` arm compiles to a subquery against `User`, which is *not* vendor-scoped.
  Indexing the two local `Order` columns is in scope; whether the `User.email` arm can be served at
  all is an open question this slice answers in `build-notes.md` rather than assumes here.

Trigram indexes cannot accelerate a term shorter than one trigram, so R5 pins **correctness** for
short terms rather than pretending performance applies to them.

### 2. #169 — `/staff/products` gains search and filters

`app/(admin)/staff/products/page.tsx` takes only `{ cursor }` while
`app/(admin)/staff/orders/page.tsx` takes `{ cursor, status, q }` and renders a real search input.
Finding one product means paging 25 at a time — on the owner's daily surface.

Reuses P6a's pattern exactly: a plain GET `<form>`, no client JS, keyset pagination preserved across
the filter. `listProductsForAdmin` (`lib/repositories/products.ts:456`) is already a **compliant pure
function** — explicit `vendorId`, no request context — so extending it adds no new exposure to
#252's nine non-compliant facades.

### 3. #136 — loyalty tiers become creatable and deletable

`/staff/loyalty` edits an existing tier's `thresholdPence` and `multiplierBps`; tier rows come from
`prisma/seed.ts` and there is no create or delete control. `saveLoyaltyConfig`
(`features/admin/loyalty-config.ts`) is the page's only action.

Two constraints, both already grounded in the schema rather than assumed:

- **A delete must not cascade to ledger rows.** `LoyaltyLedgerEntry.tierKey` is a plain `String?`
  with **no** foreign key to `VendorLoyaltyTier` — it is a *snapshot*, written on `EARN` precisely so
  history survives the tier table changing. This constraint is therefore **already structurally
  guaranteed**; R15 verifies it rather than implementing it.
- **The delete control cannot be a nested `<form>`.** `LoyaltyConfigForm` is a single client form
  wrapping every tier row. HTML forbids form nesting outright, so per the P7a (#162) pattern the
  per-tier delete binds to a separate top-level form via the standard `form="<id>"` attribute.

### 4. #160 — customer directory

There is no `/staff/customers` page and no staff-facing view of who a vendor's customers are, what
they have ordered, or their loyalty standing. Everything needed exists (`VendorMembership`,
vendor-scoped `Order`, `LoyaltyAccount`, `LoyaltyLedgerEntry`), so this is assembly.

A customer here is **a person who has placed a revenue-status order with this vendor**, not a
`User` row — the `User` table is global across tenants, and listing it on a vendor's panel would
leak one vendor's customers to another. Guest orders have no `User` at all, and P7b's erasure leaves
`userId` null by design; both are represented rather than silently dropped (R26).

### 5. #161 — non-sales reports

`/staff/reports` already renders three financial tiles, so #161's "nothing in the repo delivers any"
is stale — recorded at Propose and again here. Scope is **non-sales reports only**: catalogue/stock
health, loyalty liability, discount redemption config. Sales analytics is deliberately excluded
because production still runs Stripe **test** keys (#113), so there is no real trading data and
anything designed against fixtures would be redesigned once real order patterns appear. This is
#161's own reasoning.

**Loyalty liability honours read-time expiry.** `LoyaltyAccount.balancePoints` goes *stale* after
points lapse: expiry is derived at read time from `lastActivityAt` versus
`VendorConfig.pointsExpiryMonths`, and `balancePoints` only resets on the next `EARN`.
`lib/loyalty.ts` already exports `isLapsed()` and `visibleBalance()` — liability reuses them rather
than re-deriving the rule. A raw `SUM(balancePoints)` was rejected at Propose as the same class of
knowably-wrong aggregate that **#238** was, which is the defect P7.5a exists to fix. A vendor with
`pointsExpiryMonths = null` never lapses, and that path is exercised too.

## Deliberately excluded

- **Sales analytics of any kind** — revenue trends, best-sellers, per-period breakdowns. Excluded
  for #161's own stated reason (#113: test keys, no real trading data). R31 is a standing guard
  against it arriving by accident.
- **Fuzzy or typo-tolerant *storefront* search.** #163 indexes the **staff** order search only. The
  storefront's `ProductRepository.search()` keeps its current behaviour; broadening it is the
  long-deferred trigram item that needs the catalogue to actually grow first.
- **Relocating the nine non-compliant repository facades (#252).** `getOrderRepository`,
  `getLoyaltyRepository` and `getProductRepository` are all touched here and all on that list. This
  slice must not *grow* the list (R32) but does not shrink it — that is #252's own refactor.
- **Customer detail pages, notes, segments, or CSV export.** #160 is a directory: a paginated list
  plus each customer's order count, spend and loyalty standing. Anything per-customer beyond that is
  new capability, not the P6 roadmap-line gap.
- **Editing a tier's `key` after creation.** `key` is the stable identifier that `LoyaltyLedgerEntry`
  snapshots; making it mutable would break the audit trail's ability to explain its own numbers.
  Create and delete only.
- **Backfilling or rewriting historic `LoyaltyLedgerEntry.tierKey` values** when a tier is deleted.
  The snapshot is the record of what was true at earn time; a dangling key is correct, not corrupt.

## Corrections to persistent docs found while grounding

- **`CLAUDE.md` names the wrong path for the portal shell.** Its staff-panel rule says
  `app/(admin)/staff/layout.tsx` renders the shell; that file does not exist. The real shell is
  **`app/(admin)/layout.tsx`**. The rule's substance is unaffected — a page returning `null` on
  refusal still renders the shell with a blank body — but the path a reader would open is wrong.
  Corrected as part of this slice (R38).
- **`/staff/loyalty` does not use `<PanelRefusal>`.** It hand-rolls equivalent markup. This is the
  same drift #231 fixed in `runbook/page.tsx`, and unlike that case it does render a real message,
  so it is a consistency defect rather than a live one. Since #136 edits this page anyway, it is
  converted here (R17).

## Open items carried forward

- **#252** — nine non-compliant repository facades. Untouched by design; see above.
- **#269** — P7.5a's R8, live-verifying the staff-panel cache header against the real Cloudflare
  edge. Not folded in: it is a check against deployed production, not code in this slice.
- **Whether the `User.email` search arm can be index-served at all** (#163). Answered empirically in
  `build-notes.md`; if it cannot, that is recorded as a known limit rather than worked around with
  raw SQL in application code, which stays forbidden.
- **The PR #285 roadmap change-log row.** `sdd:audit` reports it as pending carry-forward; post-merge
  doc changes ride the next slice's branch, and this is that branch (R33).
