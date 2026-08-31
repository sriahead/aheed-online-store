---
id: catalogue-depth-and-scale
title: "Catalogue depth and scale: subcategories, a 2,000-product seed, and an honest NFR re-measurement (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-31
visibility: internal
summary: Seeds the second category tier the schema has supported since P2a but no fixture has ever populated, adds an env-gated 2,000-product generated catalogue for Aheed, and re-measures the Gate-3 read paths at that scale — closing #489 and removing the "do not build against seed fixtures" precondition blocking #286.
tags: [seed, performance, nfr, catalogue, p9]
related: [roadmap, nfr-baseline]
---

# Catalogue depth and scale (plan)

**Goal:** make the two performance claims this repo currently rests on *testable*, and populate the
category depth the schema already supports. Today `docs/developer-portal/nfr-baseline.md` reports
`API p95 < 400ms` as **met with a 2.9x margin** — measured against `Product` = 22 rows, at which the
document itself concludes *"every query is dominated by the ~15 ms round-trip to Neon and none of
them is index-sensitive yet."* That is a measurement of Neon's latency, not of this application's
queries. This slice produces a catalogue at which the distinction is observable.

Shipping it also removes the precondition that has blocked **#286** since P2 (*"should not be built
against seed fixtures"*, deferred *"until the catalogue actually grows past its current placeholder
data"*), and with it the blocker on **#396** behind it. It is a prerequisite for **#394**, whose
mega-menu cannot render a second tier without subcategory rows, and it should land before **#439**
so that LCP is measured against a realistic catalogue rather than 21 products.

## What is actually true today

Verified against the repo on 2026-08-31, not taken from any issue body:

- **`Category.parentId` has existed since P2a** (`2c3883e`). `lib/repositories/categories.ts:183`
  enforces a hard two-level cap (*"Categories only go two levels deep"*); `listTopLevelCategories`
  filters `parentId: null`; `getCategoryBySlug` already selects `children`; `parentId` is in
  `lib/catalogue-form.ts`'s `CATEGORY_FIELDS`, so staff can already assign one.
  **`prisma/seed.ts` populates zero subcategories** — the capability is built and entirely unexercised.
- **Aheed has 9 top-level categories and 18 curated products; SriMart has 2 and 3.** 21 products in
  total, consistent with the NFR baseline's recorded `Product` = 22.
- **`scripts/measure-nfr.ts` exists** and is the committed harness behind the baseline's route
  latency table. Its own docstring makes it **deliberately HTTP-only** — *"no Prisma, no repository
  imports, no session cookie, no database credential"* — which is what lets it run from a clean
  checkout (P7d R4/R6).
- **The baseline's "Index and query review" table has no committed harness at all.** It was produced
  by an ad-hoc `tsx` script over `DIRECT_URL` that was never checked in, so those four query numbers
  are, as of today, not reproducible by anyone.

## Scope (this slice)

**1. A second category tier in the seed.** Aheed gains at least three subcategories under each of its
nine departments; SriMart gains a smaller, deliberately different tree, for the same reason its
catalogue already differs — it exists to prove host-to-tenant isolation. Both respect the existing
two-level cap.

**2. An env-gated generated catalogue.** `SEED_SCALE_PRODUCTS` (the `SEED_SRIMART_HOST` precedent)
generates exactly that many additional Aheed products, distributed across the new subcategories, with
a realistic spread of price, origin, speciality flags and stock so the catalogue filters and
`getAvailableSpecialities` have something to discriminate on. Unset means today's behaviour, unchanged.

**3. Three rewrites of the generated write path**, because `seedCatalogue` as written does not survive
2,000 rows and the reasons are specific:

- **Image objects become a shared pool.** `refreshProductImages` and `seedCatalogue` each call
  `putObject` once per product with the *same* placeholder SVG bytes — 21 uploads today, and
  `refreshProductImages` runs unconditionally on **every** seed run. At 2,000 that is 2,000 identical
  uploads per run. `CLAUDE.md` requires a relative, immutable key; nothing requires one object per
  product, so generated products share roughly one key per subcategory.
- **Writes become batched.** The current path loops `tx.product.create` with nested `images` and
  `inventory` creates — 2,000 sequential Neon round-trips. The seed runs in **real Node against the
  WebSocket adapter**, so `createMany` is available here; this is explicitly *not* the Worker HTTP
  path that #382 forbids it on.
- **Idempotency gets its own check.** Today's is keyed on category slug, so generated products hung
  under an existing category would be skipped wholesale on a re-run.

**4. A committed query-level harness and a recorded re-measurement.** A new
`scripts/measure-catalogue-queries.ts` measures the Prisma read paths, and the results land as a new
dated section in `docs/developer-portal/nfr-baseline.md` beside the existing tables.

## Why a second harness rather than extending `measure-nfr.ts`

`scripts/measure-nfr.ts` states its HTTP-only property as the reason it can run anywhere, and P7d's
R4/R6 depend on it. Adding Prisma imports would silently revoke that. The two harnesses answer
different questions — route TTFB through the deployed edge, versus query time against the database —
and the baseline already reports them in separate tables under separate caveats. Keeping them
separate preserves both properties; the existing file is re-run unmodified.

The new harness takes its own `PrismaClient` from the bare `@prisma/client` specifier, exactly as
`prisma/seed.ts` and `scripts/verify-repository-injection.ts` already do, and passes it into the
repository functions as a parameter. That is only possible because those functions take `prisma` and
`vendorId` explicitly — the property #252 and #409/#411/#412 exist to protect. A repository function
that resolved its own client through `lib/db` could not be measured this way at all.

## Deliberately excluded

- **Remediating whatever the measurement finds.** Same posture #439 and #236 already take: measure,
  identify the dominant contributor, then file remediation with evidence behind it. Adding an index
  speculatively is precisely how the current baseline ended up unable to distinguish an index effect
  from Neon's autoscaling state — its own tables carry a warning not to read them as a before/after.
  If the numbers breach the Gate-3 target, that is a **finding recorded and filed**, not a failure of
  this slice.
- **#286 and #396 themselves.** This slice removes their blocker; it does not build fuzzy or
  synonym search.
- **#394, #395, #407, #405.** The persistent-chrome cluster is the follow-on slice, sequenced after
  this one so it is built against a realistic catalogue.
- **Scaling SriMart.** It stays at 3 products so cross-vendor isolation checks stay fast and so a slow
  Aheed query is provably about volume rather than about multi-tenancy.
- **Any schema change.** No migration; `Category.parentId` already exists and nothing else is needed.
- **Any application-code change.** Seed, scripts and docs only — which is also what makes the
  "measure, do not fix" posture checkable rather than a promise.
- **Brand, pack size and the speciality booleans** from #397, and the variant model from #398. The
  generated products use only fields that exist today.

## Open items carried forward

- **A pinned-dependency drift, found while writing this spec and NOT introduced by it.**
  `CLAUDE.md` requires `@neondatabase/serverless` at **0.10.4 exact**, stating that 1.x *"is allowed
  by the range but must not be used"*, and names `@prisma/adapter-neon@6.19.3`. The lockfile actually
  resolves **`@neondatabase/serverless` 1.1.0** and **`@prisma/adapter-neon` 7.9.1** against
  `@prisma/client` 6.19.3 — a cross-major adapter/client pairing the guardrails never sanctioned.
  This slice writes bulk data through that exact adapter, so it is worth settling, but it is a
  separate decision and needs its own issue and `/propose`. **Filed as #491.** Note the slice went
  on to write ~2,000 rows through that stack with no failures, so this is a guardrail-versus-reality
  mismatch rather than an observed defect.

- **A refusal guard for the generated seed path, filed as #490 rather than built.**
  `scripts/verify-repository-injection.ts` already refuses outright to run against a host named in
  `secrets/staging.vars`/`secrets/production.vars`; R13's print-and-trust-a-human is the weaker
  control, and `CLAUDE.md`'s P5a incident is precisely a human misreading a target. Deferred because
  scoping the guard to the generated path — the curated seed is legitimately run against staging and
  production — is a design decision rather than a build detail.
- **Which Neon branch the generated rows land in.** The dev branch is the intended target. `CLAUDE.md`
  records that `.env` and `.dev.vars` have previously agreed with each other while both pointed at
  **production** (the P5a incident), so R13 and R19 make the resolved host an explicit, recorded
  check rather than an assumption.
- **The board's Phase field has no P9 option** — it stops at P8, so #489 is tagged P8 following the
  precedent #456 set. Broader than #267, which reports only a missing P7.5. Needs a UI change from
  the human; not blocking.
