---
id: production-catalogue-and-image-fills
title: "Production catalogue seed, cross-environment image copy, and scheduled image fills (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: Seed production's real catalogue, carry the eight already-generated images across from staging instead of paying to regenerate them, and add a scheduled job that fills images for products added later.
tags: [seed, images, storage, production, ci, scheduling]
related: [roadmap, architecture, adr-003-storage-abstraction]
---

# Production catalogue seed, cross-environment image copy, and scheduled image fills (plan)

**Goal:** bring production's catalogue up to the shape the storefront code now expects
(subcategories, featured products, bundles), without paying to regenerate images that already
exist, and leave behind a mechanism that fills images for products added after this slice.

Issue **#518**. Answers the open decision in **#504**. Depends on **PR #517**, already merged and
deployed to production, which is what makes the subcategory, featured-row and `/bundles` code
present in production before its database gains the data those pages read.

## What is actually true today

Every number below was measured directly against both databases on 2026-09-01, not inferred.

| | production | staging |
|---|---|---|
| real-catalogue products (Aheed + SriMart) | 21 | 30 |
| categories | 11 (all top-level) | 46 (15 top-level, 31 sub) |
| products whose images are all placeholders | **0** | — |
| real (non-placeholder) image rows | 24 | 239 |

Production is **not** empty and is **not** broken: all 21 of its products already carry real
images and none are waiting on a placeholder. What it lacks is the newer catalogue — four Aheed
categories, the eight products in them, all 31 subcategories, the featured flags, and the bundle
and price-tier fixtures.

**The eight products the seed will add are the entire image problem**, and staging already holds a
real image for all eight:

`dog-food-2kg`, `cat-litter-5kg`, `infant-formula-900g`, `baby-wipes-80pk`, `toothpaste-100ml`,
`shampoo-400ml`, `frozen-chicken-nuggets`, `frozen-peas-1kg`.

## The two findings that shape the design

**1. Image keys are not portable between environments, so this is not a bucket-to-bucket copy.**
There are two key schemes in play. Seeded placeholders use `products/{slug}/main.svg`
(`prisma/seed.ts:753`) — slug-derived, therefore byte-identical across environments. Generated
images use `buildProductImageKey(productId)` giving `products/{productId}/{uuid}.webp`
(`lib/product-image.ts`) — built from the product's database id plus a fresh UUID. Product ids are
generated per environment by `tx.product.create`, so **staging's generated keys are meaningless in
production**. Copying objects by key would put bytes at addresses no production row references.

The copy must therefore be **row-aware and slug-keyed**: match products across environments by
`(vendorId, slug)`, read staging's bytes, mint a *new* production key from production's own product
id, upload there, and write the row.

**2. The copy must be driven by production's need, not by staging's contents.** Staging holds
`p5b-validation-fixture`, an artifact of P5b's validation that is not in `prisma/seed.ts`'s
`CATALOGUE` and must never appear in a live store. Enumerating "what staging has" would sweep it up.
Enumerating "which production products still have only a placeholder" cannot, because the seed will
never create that product in production. The direction of the query is a correctness property, not
a stylistic choice.

## Scope (this slice)

**Production seed.** No code change expected. Run the existing `prisma/seed.ts` against production's
`DIRECT_URL` with `SEED_SCALE_PRODUCTS` **unset** and `SEED_AHEED_HOST`/`SEED_SRIMART_HOST` set to
the production hosts. `seedCatalogue` skips a category whose slug already exists, so the nine
pre-existing Aheed categories are untouched and only the four new ones are created with their
products; `seedSubcategories` and `seedFeaturedProducts` are each their own idempotent pass designed
to reach a database seeded before they existed, which is exactly production's situation.

**`getObject` on the storage port.** `lib/storage.ts`'s `StorageService` exposes `putObject`,
`presignPut`, `headObject` and `deleteObject` — it has no read primitive at all. Add
`getObject(key)` returning `Promise<ArrayBuffer | null>`, with `null` on a 404 so a missing object
is a value rather than a throw, matching `headObject`'s existing posture. This is a genuine gap in
the port, not scaffolding for this script.

**`scripts/copy-product-images.ts`.** Takes `--from <env-file> --to <env-file>`, prints both
resolved database hosts and buckets before acting, and refuses to run when the two resolve to the
same bucket. For each destination product whose images are all placeholders, finds the same
`(vendorId, slug)` in the source, takes its primary non-placeholder image, reads the bytes,
uploads them to a newly minted destination key, and writes the row — claiming `isPrimary` and
removing the placeholder it replaces, mirroring `saveGeneratedProductImage`'s existing behaviour so
the two cannot disagree. Idempotent: a second run finds nothing needing an image and copies zero.

**`scripts/fill-product-images.ts` plus a scheduled workflow.** A `tsx` script that fills at most
`--limit N` products per run through the existing `runProductImagePipeline`, and a GitHub Actions
workflow running it on a `schedule:` cron with `workflow_dispatch` for manual runs. The script
constructs its own `PrismaClient` from the bare `@prisma/client` specifier and passes it explicitly
to repository functions — `lib/products-service.ts`'s wrappers resolve their own client through
`lib/db`, which imports `@prisma/client/wasm` and cannot load in Node.

## Why the scheduled job is still worth building for eight images

It isn't. #504 already made this argument and it is correct: for a one-time drain of eight products,
the existing admin button is adequate and this would be machinery for a problem that does not exist.

The job earns its place on the **ongoing** case instead. Products added by staff after this slice
arrive with a placeholder and nothing fills them unless a human remembers to open `/staff/products`
and press a button. A low-frequency run with a small per-run cap covers that continuously, costs
nothing on the runs where there is no work, and never becomes an unbounded spend. It is sized for
that, deliberately not for draining a catalogue.

## Deliberately excluded

- **The roughly 2,000 `gen-*` scale products.** They stay out of production entirely
  (`SEED_SCALE_PRODUCTS` unset). 206 of staging's 239 real images sit on them and are therefore
  never copied. Whether they ever belong in production is a separate decision this slice does not
  make.
- **Raising `BACKFILL_BATCH`** in `app/api/admin/jobs/backfill-images/route.ts`. The admin button
  keeps its cap of 10; the scheduled job is a separate path with its own cap.
- **#364** — AI images written as PNG bytes under a `.webp` key. This slice copies and generates
  images through the existing pipeline and so propagates that behaviour; it neither introduces nor
  fixes it.
- **#507** — `BackfillImagesButton`'s blocking `alert()`.
- **A general-purpose environment-sync tool.** The copy script solves images for products missing
  them. It is not a data migration framework and should not grow into one.
- **Any Cloudflare cron trigger.** `@opennextjs/cloudflare@1.20.2`'s generated worker exports
  `fetch` only and the string `scheduled` appears nowhere in the package, so a `[triggers]` block
  would fire into a Worker with no handler. Recorded here so it is not re-attempted.

## Open items carried forward

- **#513** — the delivery board's Phase field has no P9/P10 option, so this is tagged P8 like its
  neighbours.
- **#113** (production still runs Stripe test keys) and **#104** (no verified Resend sending domain)
  remain open. This slice populates a catalogue; it does not open the store.
