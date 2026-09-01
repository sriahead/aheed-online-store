---
id: product-image-integrity
title: "Product image integrity — staging placeholders, backfill detection, Open Food Facts control (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: Staging 404s every seeded product image because the seed returns before its own uploads; the button meant to fix that matches nothing and would write a non-primary row anyway; and Open Food Facts repeats one wrong image for similar names without flagging it.
tags: [images, storage, seed, admin, catalogue]
related: [roadmap, architecture, adr-003-storage-abstraction]
---

# Product image integrity (plan)

**Goal:** make a product's image tell the truth in every environment — the object exists where the
row says it does, the operator's repair tool actually finds and fixes the products that need it,
and an image sourced from a third party is marked as needing a human look rather than trusted
silently.

This is slice B of the three-slice plan approved at Gate 1 for the defects found reviewing staging
on 2026-09-01. Slice A is #501 (storefront browsing), slice C is #503 (admin filter and latency).

## What is actually broken

Four defects that compound. Each was confirmed against a live environment, not inferred.

### 1. Staging references image keys that do not exist

HEAD requests against all three CDN zones on 2026-09-01:

| key | dev | staging | production |
|---|---|---|---|
| `products/gen-south-asian/main.svg` | 200 (381 B) | **404** | 404 |
| `products/cat-litter-5kg/main.svg` | 200 | **404** | 404 |

Staging emits those keys: `/categories` references 4, `/search?q=rice` references 12 (all `gen-*`
products). **Production is unaffected** — it carries no generated products, and its curated
products have real uploaded `.webp` images which all return 200. So this is a staging asset gap
plus a latent seed defect, not a live production incident.

This is **not** the CDN hotlink/referer restriction recorded in `CLAUDE.md`. That rule covers
raster assets under a `localhost` referer; these are `.svg`, and the 404 comes back with no referer
sent at all.

The mechanism is `prisma/seed.ts`'s `seedGeneratedCatalogue`, which opens with an existence check:

```
const existing = await prisma.product.count({ ... slug startsWith GENERATED_SLUG_PREFIX ... });
if (existing >= count) { console.log("...skipping"); return; }
```

That early return fires **before** the `putTracked` placeholder uploads further down the same
function. Once the rows exist in a database, no later seed run uploads the objects into that
environment's bucket. Rows and objects are written by one function but guarded by a row-only
check, so they diverge per environment — exactly what happened between dev and staging.

### 2. "Auto-fill Missing Images" can never match anything

`getProductsWithoutImages` filters on `images: { none: {} }`. Measured against the dev branch:
`noImages = 0` for both vendors. Every product carries a placeholder `main.svg` row from the seed,
so the job always reports "No products need backfill". It asks for products with *no image row*
when the real condition is products stuck on a shared placeholder.

### 3. A backfilled image would not display even so

`saveGeneratedProductImage` writes `isPrimary: false`. Every storefront card reads
`images: { where: { isPrimary: true }, take: 1 }` (`findPage` in `lib/repositories/products.ts`).
So once defect 2 is fixed, a generated image would upload, cost an AI call, and still not appear.

### 4. Open Food Facts repeats one wrong image, and it is the one never flagged

`lib/product-metadata.ts` text-searches with `page_size=1` and returns `products[0]` with no
relevance check at all. Names sharing a keyword — "Golden Paneer 500g", "Premium Paneer 500g",
"Fresh Paneer 250g" — rank to the same top hit and therefore receive the identical image. That is
the "keeps repeating" the operator reported.

Compounding it, `runProductImagePipeline` sets `needsReview = true` **only** on the AI fallback
branch. The third-party image — the one most likely to be wrong — is saved with
`needsReview: false` and never raises the "Image Needs Review" badge the admin list already
renders.

## Scope (this slice)

- **`prisma/seed.ts`** — move `seedGeneratedCatalogue`'s placeholder `putTracked` uploads above the
  early return, so re-running against an already-populated database still writes the objects. The
  row-creation work stays behind the guard; only the storage work moves.
- **`scripts/restore-placeholder-images.ts`** — a committed, re-runnable script that uploads the
  placeholder object for every distinct `main.svg` key referenced by `ProductImage` rows in the
  target database. Reads the DB, writes only storage. Idempotent.
- **`components/product/ProductCard.tsx`** — a card whose image fails to load falls back to the
  existing grey "no image" box instead of the browser's broken-image icon. This is what stops the
  whole defect class from being user-visible again in any environment, whatever the bucket state.
- **`lib/repositories/products.ts`** — `getProductsWithoutImages` finds products whose only image
  is a shared placeholder as well as products with no image row at all;
  `saveGeneratedProductImage` writes `isPrimary: true` when the product has no existing primary,
  and replaces the placeholder row rather than accumulating beside it.
- **`scripts/verify-repository-injection.ts`** — extended with a `getProductsWithoutImages` case.
  That script already creates a `__verify-`-prefixed product and product image against a real
  database and removes them on exit, and already refuses to run against staging or production, so
  it is the existing harness for proving R7's predicate against real rows rather than a
  hand-constructed mock.
- **`lib/product-image.ts`** — a pure `isPlaceholderImageKey(key)` predicate, so the rule defining
  "this is a placeholder, not a real image" is unit-testable with no database, matching the
  module's existing posture.
- **`lib/product-metadata.ts`** — reject an Open Food Facts hit that shares no meaningful token
  with the product name, via a pure exported matcher. Same file keeps the barcode path unchanged.
- **`lib/product-image-pipeline.ts`** — accept a `useOpenFoodFacts` option, and set
  `needsReview: true` on the Open Food Facts path as well as the AI path.
- **`app/api/admin/jobs/backfill-images/route.ts` + `components/staff/BackfillImagesButton.tsx`** —
  an operator checkbox controlling whether Open Food Facts is consulted for this run.

## Where the Open Food Facts toggle lives, and why

**A per-request flag from the admin UI**, defaulting to on — not validated config in `lib/config`,
and not a per-vendor storefront config row.

The proposal left this open. Config lost because flipping it needs a deploy, and the operator's
actual need is per-run: they see a wrong image come back, want to re-run without that source, and
want it back afterwards. A vendor config row lost because this is an operator switch about a
third-party data source's quality on a given day, not a merchandising decision that belongs to a
vendor's stored settings — and it would cost a migration to express something no shopper ever sees.

## Deliberately excluded

- **Better Auth `session.cookieCache`, vendor-id memoisation, the `Product` ordered index, and the
  admin category filter** — all slice C (#503).
- **Every storefront browsing change** — View all destinations, row scrollers — slice A (#501).
- **Replacing the placeholder with real product photography.** This slice makes the placeholder
  reliably *present* and makes the repair tool work; sourcing real imagery for 2,026 products is
  merchandising work, not a defect fix.
- **Raising the 10-per-click backfill cap, or a queue/cron to drain the catalogue.** The cap stays
  deliberately: with 2,026 products on the Aheed vendor, an uncapped run is an unbounded spend on
  Cloudflare Workers AI. Draining the full catalogue would need 200+ clicks, which is a real
  limitation and is recorded as such rather than silently fixed here — see open items.
- **Excluding `gen-*` demo products from the backfill.** They are legitimate targets if an operator
  wants a populated-looking demo; the cost guard is the cap, not a category exclusion.
- **Backfilling production.** Production has no broken keys today. The seed fix and the script are
  what make it safe if it ever does.
- **Any change to `Product` or `ProductImage` schema.** The placeholder rule is derivable from the
  key's shape, so an `isPlaceholder` column would be a migration buying nothing this slice needs.

## Open items carried forward

- **Draining 2,026 products 10 at a time is impractical** — tracked as **#504**. Needs its own
  decision about batching, cost ceiling and whether the demo catalogue deserves real images at all.
- **`.env` violates `CLAUDE.md`'s own env-format rule** — spaces around `=` and trailing
  `# comment`s on the same line as values, including on `DATABASE_URL`. It happens to parse today.
  Tracked as **#505**; it is why this slice's script carries a hand-rolled `parseEnvFile`.
