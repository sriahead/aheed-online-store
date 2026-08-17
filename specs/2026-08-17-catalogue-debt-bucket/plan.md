---
id: catalogue-debt-bucket-plan
title: "Catalogue debt bucket: broken homepage rows, real featured flag, multi-image admin management (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-17
visibility: internal
summary: Fixes two homepage product rows that currently render nothing, replaces the isHalal-proxy featured rail with a real isFeatured flag, and builds the multi-image admin management (add/remove/reorder/set-primary) that has never existed despite the schema supporting it since P2.
tags: [catalogue, product-image, storage, homepage, debt, gap-013, gap-014, gap-015]
related: [gap-register-audit, p6-5-residual-validation-plan]
---

# Catalogue debt bucket: broken homepage rows, real featured flag, multi-image admin management (plan)

**Goal:** clear three related pieces of catalogue/product-image debt in one slice — a live homepage
bug discovered while scoping this work, GAP-013's `isHalal` proxy (#208), and GAP-014/GAP-015's
multi-image admin management (#173, #174) — so the gap register's remaining non-`Open` rows outside
GAP-011 are all genuinely `Fixed`, not `Deferred` or partially true.

Issue: **#211**. Explicitly excludes GAP-011 (search trigram index) — flagged at Propose as needing
its own decision, since it conflicts with CLAUDE.md's "no raw SQL in application code" rule.

## Why this slice exists

Scoping GAP-014/GAP-015 (originally just "remove and reorder are missing") surfaced that the real
gap is bigger: `attachProductImage` (`features/admin/product-image.ts:102`) always calls
`setPrimaryProductImage`, which repoints the single existing primary row rather than ever creating a
second one. `ProductImage` has carried `sortOrder`/`isPrimary` since P2 and the storefront gallery
(`components/product/ProductImageGallery.tsx`) already renders an array correctly — but **no code
path has ever added a second image to a product.** #173's own text already anticipated this
("Check what the storefront actually renders... there may already be a consumer for multiple images
that has never had data to show") — it was right.

Separately, live-checking the code around GAP-013 turned up a bug #208 didn't know about:
`app/(storefront)/page.tsx:27-28` fetches both the "New Arrivals" and "Featured Halal Deals" rows via
`productsRepo.search("", {...})`. `lib/repositories/products.ts:174-175`'s `search()` unconditionally
returns zero results for an empty query (correct for its real caller, the `/search` page), and
`ProductRow` (`components/product/ProductRow.tsx:14`) renders nothing when given zero products.
**Both homepage rows currently render nothing at all** — verified against `npm run preview`, where
neither row's title appears anywhere in the rendered HTML, while a real query
(`/search?q=apple`) correctly returns a product card. #208's own text ("It renders correctly; only
its data source is a placeholder") is wrong on the first half.

## Scope (this slice)

**1. Fix the broken homepage rows.** Add a repository method that lists products by filter without
requiring search text (`search()`'s empty-query guard stays exactly as it is — it's correct for
`/search`). `app/(storefront)/page.tsx` calls the new method for both rows instead of misusing
`search("")`.

**2. #208 — real `isFeatured` flag.** Additive column on `Product` (vendor-scoped, mirroring
`isHalal`/`isFresh`/`isOrganic`'s existing field/form/repository wiring in `lib/catalogue-form.ts`
and `lib/repositories/products.ts`). Admin checkbox in `ProductForm`. The rail is renamed **"Featured
Products"** and reads `isFeatured` via the new method from (1) — no interaction with `isHalal` or
with `originalPrice`'s existing discount-badge derivation, which stays untouched. This decides the
"featured vs. deals — one concept or two?" question #208 flagged for Propose: they stay two.

**3. #173 + #174 — multi-image admin management, combined.** New repository functions:
`addProductImage` (create a new, non-primary row — primary only if the product currently has none),
`promoteProductImage` (flip which existing row is primary, without touching either `storageKey`),
`removeProductImage` (delete a row; if it was primary and others remain, promote the lowest
remaining `sortOrder`), `reorderProductImages` (rewrite `sortOrder` to a given order, refusing if the
id set doesn't match exactly). Each gets its own server action in
`features/admin/product-image.ts`, independently authorized, matching the existing actions' posture.
`getProductForAdmin`'s image selection gains `id`/`sortOrder` (currently only
`storageKey`/`alt`/`isPrimary`) so the UI can target a specific row. `ProductForm`'s Images section
becomes a real gallery: per-image Set-primary/Remove/reorder controls, plus an "add another image"
path distinct from the existing (unchanged) primary-replacing upload.

**Storage cleanup, decided at Propose: inline delete.** `lib/storage.ts`'s `StorageService` gains
`deleteObject(key)`, called synchronously from `removeProductImage`. Per #174's own framing this
covers superseded/removed objects but not abandoned uploads (browser closed between the presigned
PUT and the row being written) — that narrower gap stays open under #174, not urgent (R2 storage is
cheap). A scheduled sweep (`wrangler.toml`'s first cron trigger) was considered and rejected as
bigger infrastructure than fits a debt-cleanup slice.

**4. Standing-decision docs.** `deleteObject` changes a documented decision, not just code:
`specs/architecture.md` §3.3 and `specs/decisions/ADR-003-storage-abstraction.md` both currently
state the port has four methods and that delete is "deliberately absent" pending #174's own
decision. Both get an additive implementation note (matching the existing 2026-08-12 note's style)
recording that #174 was partially decided here.

**5. Register and roadmap reconciliation.** `docs/gap-register.md`'s GAP-013 (currently
`Fixed (partial)`), GAP-014 and GAP-015 (currently `Deferred`) rows and detailed sections updated to
`Fixed`, each citing the concrete artifact. `specs/roadmap.md` gets a change-log row.

## Deliberately excluded

- **GAP-011** (search trigram index, #163/#169) — raw-SQL conflict with CLAUDE.md, needs its own
  decision before it can be scoped at all.
- **Abandoned-upload cleanup** (uploaded object with no `ProductImage` row ever written) — stays on
  #174; inline delete doesn't reach it, and it isn't urgent.
- **Any change to `search()`'s empty-query behavior.** It is correct today for `/search`; only the
  homepage's misuse of it is wrong.
- **Backfilling `isFeatured` on existing seed data.** The homepage's "Featured Products" row will
  legitimately be empty (and hidden, not broken — `ProductRow` returns `null`) until a vendor admin
  flags at least one product. Validation exercises that flow live rather than pre-seeding it.
- **Drag-and-drop reordering, or any new dependency.** Up/down controls on plain forms, matching
  this repo's existing no-JS-framework-beyond-React posture for admin surfaces.
- **`availableSpecialities()` / storefront browse filters.** `isFeatured` is a curation flag driving
  one homepage rail, not a customer-facing filter like Halal/Fresh/Organic.

## Open items carried forward

- **#174** stays open for abandoned-upload cleanup (not resolved by this slice's inline delete).
- **GAP-011** stays `Deferred`, tracked by #163/#169, pending a decision on the raw-SQL question.
