---
id: p7d-observability-nfr-plan
title: "P7d — Workers observability & NFR baseline (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-19
visibility: internal
summary: Turns on Workers observability, builds a repeatable NFR measurement harness, and records the first real numbers for LCP and API p95 — plus an index/query review that already found a documented index which does not exist.
tags: [p7, observability, performance, nfr, indexes, sdd]
related: [gap-register-audit, architecture, tech-stack, mission]
---

# P7d — Workers observability & NFR baseline (plan)

**Goal:** stop asserting the non-functional targets and start measuring them. `specs/mission.md`
sets `LCP < 2.5s` on 4G and API `p95 < 400ms`, and `specs/architecture.md:420` calls them
"Gate-3 acceptance criteria" — but no measurement against either number has ever been taken, and
`wrangler.toml` has no `[observability]` block to take one with. Shipping this slice means the next
person who asks "is the storefront fast enough?" gets a number and a command to re-run, instead of
a sentence.

This is the first of four slices closing out P7 (campaign recorded on **#90**).

## Why the requirements are shaped the way they are

**A measurement slice must not be able to "pass" by tuning until green.** If `R_n` read
`LCP < 2.5s`, then the only way to ship a red measurement would be to keep adjusting until the
number cooperated — which is how a baseline becomes a fiction. So the requirements below assert
that **a measurement was taken by a named method and recorded with its raw numbers**, and,
separately, that **any breach of a target is either remediated in this slice or filed as an issue
citing the measured value**. Both halves are objectively checkable; neither rewards a flattering
result. This is the same reasoning that made #231 rewrite P6.6's unfalsifiable "matches the
prototype" rows.

**Client-observed latency is not server-side latency, and the spec says which one each row means.**
The harness measures wall-clock time-to-first-byte from whatever machine runs it, over whatever
connection it has — a useful, reproducible figure, but not the `p95` a Cloudflare dashboard would
report. Workers observability supplies the server-side view. The baseline document records both,
labelled, rather than quietly presenting one as the other.

## Scope (this slice)

**Observability.** A top-level `[observability]` block in `wrangler.toml` with an explicit
`head_sampling_rate`, applying to the `staging` and `production` environments, plus the live proof
that request events actually arrive (`wrangler tail`). `specs/tech-stack.md:99` already promises
"Observability via Cloudflare analytics/logs" — this is the line being made true.

**A measurement harness.** `scripts/measure-nfr.ts`, run through `npx tsx` against a base URL,
issuing a fixed request count across a named route set and printing per-route `p50`/`p95`/`p99`,
sample count and error count as JSON. Committed and wired to `npm run nfr:measure`, so the number
is reproducible by someone who was not present — the same reason `scripts/verify-data-rights.ts`
exists. It measures **public** routes only, so no session is needed to run it.

**A recorded baseline.** `docs/nfr-baseline.md` (front-mattered, indexed) holding the raw numbers,
the method, the date, the environment, and the explicit statement of which figures are
client-observed and which are server-side.

**An index/query review against the schema, not against the docs.** Grounding for this slice
already turned up two things worth the whole review:

- **`specs/architecture.md:308` claims an `Order(userId, createdAt)` index for order history. No
  such index exists.** `prisma/schema.prisma`'s `Order` has `@@index([vendorId, createdAt])` and
  `@@index([vendorId, status, createdAt])` and nothing else, while
  `lib/repositories/orders.ts:710`'s `listForUser` filters on `{ vendorId, userId }` ordered by
  `(createdAt desc, id desc)`. Postgres can therefore serve it only by walking the vendor's orders
  in date order and discarding rows belonging to other customers — work proportional to the
  **vendor's** order volume, not the shopper's. This slice adds the missing composite index in a
  migration. It is exactly GAP-010's shape (a capability recorded as delivered against code that
  never implemented it), found the same way: by comparing a document to the artifact.
- **`specs/tech-stack.md:105` and `specs/architecture.md:318` contradict each other on ISR.**
  tech-stack still lists "Next.js Data Cache / ISR for catalogue and product pages" as the caching
  strategy; architecture has that same strategy struck through, with the reason it cannot work here
  (`@prisma/client/wasm` only loads in the Workers runtime, so prerendering in Node hard-fails the
  build). A reader who opens tech-stack first is told the opposite of current truth. Corrected here,
  because caching strategy is this slice's subject matter.

**The `pg_trgm` / raw-SQL ruling (GAP-011).** The trigram index for product search has stayed
deferred because nobody has decided whether **migration-level DDL** counts as "raw SQL in
application code" under `CLAUDE.md`'s schema rules. This slice settles that question and records
the ruling in `CLAUDE.md`, because the same question blocks #220 (RLS policies are also raw DDL)
and it should be answered once, by the slice that reaches it first, rather than twice.

The distinction the ruling has to draw is already visible inside this slice, which is part of why
it belongs here. R15's index migration contains a `CREATE INDEX` statement — but nobody
hand-authored it: it is DDL that Prisma *generated* from an `@@index` declaration in
`schema.prisma`, and the schema stays the single source of truth. A `pg_trgm` index or an RLS
policy is the opposite case — DDL hand-written into a migration for something the Prisma schema
language cannot express at all, which means the schema no longer describes the database. Those are
different risks wearing the same syntax, and the current rule's wording does not separate them.

## Standing docs this slice changes

`specs/tech-stack.md` (observability mechanism, ISR correction), `specs/architecture.md` §3.4
(indexing paragraph reconciled to the schema) and `CLAUDE.md` (the DDL ruling) all carry standing
decisions this slice changes, so they are updated on this branch rather than deferred to the
post-ship pass.

**#236 — the cart-mutation ceiling.** Its own issue states it depends on this slice for the
measurement to be meaningful; nothing today can distinguish a Worker CPU limit (`cpu_ms = 50`) from
a subrequest limit from connection exhaustion. With observability on, the ceiling is re-driven and
the cause either attributed or explicitly recorded as un-attributable with what was ruled out.

**#46 — `next/image` vs `<img>`.** Product images are the usual LCP element, so this decision
belongs with the LCP measurement rather than ahead of it. The decision has a hard external input:
Cloudflare Image Transformations are a plan-gated feature, and per `CLAUDE.md` this slice may not
assume infrastructure it has not confirmed exists. So availability is **checked and recorded**, and
the decision is made with that as a stated input.

## Deliberately excluded

- **Neon PITR / backup retention, alert routing, and UAT.** P8 owns these; the roadmap's P7 line was
  corrected on P7b's branch specifically to stop the two phases each assuming the other had them.
  Observability here means "the app emits measurable events", not "someone is paged at 3am".
- **Row-level security (#220).** Its own slice, third in the campaign. This slice only settles the
  DDL-vs-raw-SQL question that #220 also needs.
- **Load/throughput testing against `mission.md`'s ~1,000 orders/day and ~100 concurrent
  shoppers.** The harness measures latency at low concurrency; proving a throughput ceiling needs
  sustained synthetic load against a database that is not shared with live staging work. Out of
  scope, and called out here so it is not mistaken for covered.
- **The 99.5% availability target.** Needs a long observation window, not a slice.
- **Fixing #238 (staff reports count cancelled and unpaid orders as revenue).** The query review
  will list `getFinancialsForStaff` as a full-table aggregate, because it is one — but the *defect*
  in it is a correctness bug with its own issue on P6, and folding it in here would put a money-
  behaviour change inside a measurement slice.
- **Fixing #237 / GAP-020 (`/staff/reports` served stale from cache).** Cache-key investigation is
  its own P8 item. Observability may illuminate it; that is a hoped-for side effect, not a
  deliverable.
- **Admin/staff surfaces in any #46 image work.** If the decision is to change image rendering, the
  change is bounded to the storefront surfaces that actually affect LCP (`ProductCard`,
  `ProductImageGallery`) — `components/staff/*` and `InventoryTable` are not on a shopper's
  critical path and are not touched.
- **Retro-fitting `pg_trgm` itself.** This slice makes the *ruling* that unblocks GAP-011; building
  the trigram index remains gated on catalogue size, per the existing deferral.

## Open items carried forward

- **#163** (staff order search is an unindexed `contains` scan) is reviewed and measured here, but
  is expected to stay open: `lib/repositories/orders.ts:572` already documents it as a deliberate
  scan, and the fix is the same `pg_trgm` work GAP-011 defers on catalogue size. This slice records
  the measured cost so the deferral is evidence-based rather than assumed.
- **#46 and #236** are resolved here *or* updated with the measured numbers and left open with a
  stated next step. Which one happens depends on what the measurement says, and the requirements
  cover both branches so that neither outcome can quietly skip being recorded.
- **Image Transformations availability** is an account/plan fact this slice can only read, not
  provision. If it turns out to need enabling and that is a paid change, this slice stops and lists
  it rather than assuming it — `CLAUDE.md`'s hard stop on inventing infrastructure.
