---
id: p2a-catalogue-browsing
title: "P2a — Catalogue Browsing (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-07
visibility: internal
summary: Plan for the first P2 slice — categories, product pages, images via the storage port, and keyset pagination — split from search & filters, which lands separately as P2b.
tags: [p2, catalogue, prisma, storage]
related: [architecture, adr-003-storage-abstraction, roadmap]
---

# P2a — Catalogue Browsing (plan)

**Goal:** ship a real, browsable catalogue — categories, product detail pages, images served via
the S3-compatible storage port + CDN, keyset-paginated listings — proving the full read path
(`browser → Next.js → Repository → Prisma → Neon` and `browser → CDN → R2` for images) before
search/filters or any purchase flow exists.

**Trigger — why this is split from the roadmap's full P2 line:** P2's roadmap line bundles
categories/products/images/pagination together with search & filters. Splitting mirrors P1a/P1b:
ship the core browsable catalogue first (this slice), layer search & filters on top once it's
proven (P2b, issue #34), rather than growing one large, harder-to-validate PR. Confirmed with the
user during `/propose`, along with two other decisions:
1. **Seed data** — no real Aheed product data/photography exists yet. This slice seeds
   placeholder/dummy products so the catalogue works end-to-end; real data swaps in later without
   code changes (data-only).
2. **Storage credentials** — `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`/
   `S3_REGION`/`CDN_BASE_URL` are confirmed set as Worker secrets on **staging**. **Production**
   still needs the same treatment before this slice can promote past staging — tracked as an open
   item below, not a blocker for building/validating on staging.

**Scope (this slice):**
- Prisma: `Category`, `Product`, `ProductImage`, `Inventory` — the representative schema already
  designed in `specs/architecture.md` §3.2 (fields, relations, indexes). This slice implements
  that design; it doesn't re-derive it. Migration applied directly against Neon staging via
  `prisma migrate dev` (no separate local Postgres, same pattern P1a used), committed under
  `prisma/migrations/`.
- `lib/repositories/products.ts` / `categories.ts` — `ProductRepository`/`CategoryRepository`
  ports + Prisma implementations, mirroring `lib/storage.ts`'s `interface` + `getX()` factory
  shape. **Flat files, not a `lib/repositories/products/` directory** — `docs/repo-structure.md`
  sketches directories per domain, but P1a already established the flat-file precedent
  (`lib/auth.ts`, not `lib/auth/`) over that sketch; this follows the actual precedent, not the
  aspirational doc, per the Orient step. Presentation code never imports Prisma directly (Clean
  Architecture — `specs/architecture.md`'s "Respect the layers").
- Keyset (cursor) pagination on product listings, cursor `(createdAt, id)`, Prisma `cursor` +
  `take` — never `OFFSET`, per `specs/architecture.md`'s pagination strategy.
- `app/(storefront)/categories` (index of top-level categories), `app/(storefront)/categories/
  [slug]` (a category's products, paginated), `app/(storefront)/products/[slug]` (product detail).
  Flat `/products/[slug]` rather than nesting under category — `Product.slug` is already globally
  unique in the schema, and flat avoids cascading route breaks if a product's category changes.
- `components/product/` — product card, image gallery, and a pure `formatPrice(pence)` helper
  (`450` → `"£4.50"`) — unit-tested, matching `lib/storage.ts`'s `composePublicUrl` precedent for
  pure/testable helpers alongside I/O-bound code that isn't unit-tested.
- Images resolved via `composePublicUrl(CDN_BASE_URL, storageKey)` (already exists in
  `lib/storage.ts`) — never a raw R2/S3 URL, never a URL stored in the DB.
- `Inventory`: schema-level only, surfaced as a minimal in-stock/out-of-stock indicator on the
  product card and detail page. No management UI — that's P6 (admin panel).
- Seed script (`prisma/seed.ts`, extended) creates placeholder categories/products, and actually
  uploads a placeholder image asset through `lib/storage.ts`'s `putObject()` for each
  `ProductImage` row — proving the real storage round-trip, not DB rows pointing at keys that
  don't resolve to anything. Placeholder art is a single hand-authored SVG checked into the repo
  (`prisma/seed-assets/placeholder-product.svg`) — not real product photography.

**Deliberately excluded:**
- Search and filters — P2b (issue #34), once this lands.
- Trigram/full-text search index — `specs/architecture.md` explicitly defers this until the
  catalogue actually grows; premature here.
- Homepage changes — `/` stays as M0 left it; no category/product rails added yet.
- Real product data/photography — placeholder data only, per the confirmed decision above.
- Inventory management UI, low-stock alerts, restocking — P6.
- Cart/checkout affordances ("Add to basket") — P3. Product pages are informational-only in this
  slice.

**Checked against existing ADRs:** ADR-003 specifies `StorageService` should eventually cover
`put`/`get`/`delete`/presigned URLs; `lib/storage.ts` today only has `putObject`/`publicUrl`. This
slice doesn't need more than that (reads go through the CDN, not a `getObject` call; `delete` is
P6/admin territory) — not a contradiction, just an already-known partial implementation, noted so
it isn't mistaken for something this slice forgot.

**Open items carried forward:**
- Production Worker secrets (`S3_*`/`CDN_BASE_URL`) — staging confirmed, production not yet.
  Blocks promoting this slice past staging, not building/validating it.
- P2b — search & filters, once this slice lands (issue #34).
- `docs/repo-structure.md`'s `lib/repositories/` directory-per-domain sketch has now been
  contradicted twice (auth, catalogue) by the flat-file precedent actually used — worth a small
  follow-up doc fix at some point, not blocking this slice.
