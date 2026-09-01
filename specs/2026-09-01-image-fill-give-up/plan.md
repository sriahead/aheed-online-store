---
id: image-fill-give-up
title: "A give-up path for products the image pipeline can never fill (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: Workers AI permanently refuses some halal meat product names as NSFW; the bounded, newest-first fill selection would re-pick such a product on every scheduled run forever, so failed attempts are now counted and exhausted products are excluded and reported.
tags: [images, scheduling, ai, catalogue, migration]
related: [roadmap, architecture, adr-003-storage-abstraction]
---

# A give-up path for products the image pipeline can never fill (plan)

**Goal:** stop one un-fillable product from stalling the scheduled image job indefinitely, and make
the fact that it has been given up on visible rather than silent.

Issue **#523**, found while filling images for `#521` and confirmed live in production.

## What is actually broken

`@cf/black-forest-labs/flux-1-schnell` **permanently refuses** some legitimate product names:

```
AiError: Input prompt contains NSFW content. (code 8007)   HTTP 400
```

`Halal Chicken Thighs 1kg` failed on **four separate attempts across three runs**. The prompt
`lib/product-image-pipeline.ts` builds is unremarkable — "Product photo of &lt;name&gt; on a plain white
background, studio lighting, top quality, centered."

**This matters more than one product.** The store is a halal butcher: `chicken-poultry`,
`beef-mince` and `lamb-mutton` are its defining departments and exactly the names most likely to
trip a raw-meat content filter.

**And it would quietly stall the scheduled job.** `getProductsWithoutImages` is **newest-first and
bounded**. A product that can never succeed is never removed from that selection, so on every
scheduled run it is picked again, consumes one of the run's slots, fails, and leaves the genuinely
fillable backlog behind it untouched — while the job reports success. With a small daily cap, a
handful of permanently-refused names is enough to stall it indefinitely.

The script already handled the error correctly per product (log, count, continue). The gap was that
**nothing recorded that a product had failed**, so nothing could skip it next time.

## Scope (this slice)

**`Product.imageAttemptFailures`** — a new `Int @default(0)` column, with its own migration.

**`lib/product-image.ts`** gains `MAX_IMAGE_ATTEMPT_FAILURES` (3) and a pure
`hasExhaustedImageAttempts(failures)`. It lives with the other image rules so the threshold
governing a paid, scheduled job is testable without a database or a live AI call.

**Three rather than one, deliberately.** The filter is demonstrably flaky in *both* directions:
`Gulab Jamun 1kg` and `Extra Noodles 1L` were each refused once and then accepted on a retry. One
strike would permanently give up on products that do work; a large number would defeat the purpose,
since every attempt that reaches AI generation is a paid call repeated on every run.

**`getProductsWithoutImages`** excludes products at or past the threshold.

**`recordImageAttemptFailure(prisma, vendorId, productId)`** — singular `update`, not `updateMany`
(CLAUDE.md #382: the query compiler wraps `updateMany` in a transaction the HTTP adapter cannot
execute, and the admin route runs on `getPrisma()`). Scoped by `vendorId` in the `where`, so a
caller cannot increment a counter on another tenant's product.

**`saveGeneratedProductImage` resets the counter** whenever an image lands, so a product that later
loses its image is retried rather than excluded forever by a historic failure.

**Both callers record failures** — `scripts/fill-product-images.ts` and
`app/api/admin/jobs/backfill-images/route.ts`. If only one did, a product would stay selectable
through one path while the other had written it off.

**The run reports what it skipped.** `countProductsWithExhaustedImageAttempts` feeds a line on
every run. A give-up rule that silently shrinks the work list is the same class of problem it was
built to fix: the job would report "nothing to do" while products sat permanently unfilled and
nothing pointed at them.

## Deliberately excluded

- **A sanitised-prompt retry.** `#523` offers it as an optional second piece. It is a different
  question — what a good fallback prompt *is* — and guessing at one would produce an image that
  does not depict the product, which is worse than the grey "no image" box the placeholder already
  degrades to (`#502`).
- **An admin surface listing given-up products.** The count is reported per run and the column is
  queryable; a staff screen is worth its own decision, not a bolt-on here.
- **Changing the image provider**, and **`#364`** (PNG bytes under a `.webp` key).
- **Re-filling `Halal Chicken Thighs 1kg`.** It already has an image, uploaded manually through the
  admin console, so it is not selected by this path at all.

## The migration carries a known trap, and it fired

`prisma migrate dev --create-only` generated **three `DROP INDEX` statements** for the hand-authored
`pg_trgm` indexes (`Order_guestEmail_trgm_idx`, `Order_orderNumber_trgm_idx`,
`User_email_trgm_idx`) alongside the single unrelated column on `Product`. They were removed from
the migration before it was applied, and the file carries a comment saying so.

This is the **third** recorded occurrence of CLAUDE.md's GAP-011 drift, and the first where
`--create-only` caught it before anything executed — in `#508` the drops actually ran against the
dev database before being noticed. Prisma's schema language cannot express a trigram index, so
`schema.prisma` does not describe them and every `migrate dev` proposes dropping them as drift,
whatever table the real change touches.

## Open items carried forward

- The six S3/CDN secrets for the `production` GitHub environment, still outstanding from `#518` —
  without them the scheduled job this slice protects cannot run at all.
- **`#364`** — AI images written as PNG bytes under a `.webp` key.
