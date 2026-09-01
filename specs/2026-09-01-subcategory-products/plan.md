---
id: subcategory-products
title: "Products in every subcategory, for both vendors (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: Every one of production's 31 subcategories was empty because the curated fixture assigns all its products to top-level categories; generation is extended to SriMart and both vendors' second tier is populated and given real images.
tags: [seed, catalogue, images, production, multi-tenant]
related: [roadmap, architecture]
---

# Products in every subcategory, for both vendors (plan)

**Goal:** make the second navigation tier — the one `#494` and `#498` built — actually reviewable,
by putting products behind every subcategory for both vendors and giving them distinguishable
images.

Issue **#521**. Follows **#518**, which seeded production's real catalogue and whose
`scripts/fill-product-images.ts` this slice reuses unchanged.

## What was actually wrong

Measured against production on 2026-09-01, after #518:

| vendor | top-level | with products | subcategories | with products |
|---|---|---|---|---|
| aheed-food-centre | 13 | 13 | 27 | **0** |
| srimart | 2 | 2 | 4 | **0** |

Every top-level category had exactly 2 products, so the top tier looked correct and the gap was
invisible from the home page. **All 31 subcategories were empty.**

The cause is structural rather than a data accident, and it was never specific to production:
`prisma/seed.ts`'s `CATALOGUE` fixture assigns every curated product to a **top-level** category.
The only code path that has ever put a product in a subcategory is `seedGeneratedCatalogue`, which
`#518` deliberately kept out of production. So in every environment, the second tier was populated
only as a side effect of the 2,000-row scale set.

**A second, narrower defect sat underneath it.** `seedGeneratedCatalogue` was already fully
vendor-generic — it takes `vendorId` and `catalogue` as parameters — but its only **call site**
passed `AHEED_VENDOR_ID`. So SriMart's subcategories were empty in *every* environment including
dev and staging, and no amount of `SEED_SCALE_PRODUCTS` could fill them.

## Scope (this slice)

**`prisma/seed.ts`** — a `maybeSeedGeneratedCatalogue(envVar, vendorId, catalogue)` helper replaces
the inline `SEED_SCALE_PRODUCTS` parsing, and is called twice: once for Aheed with
`SEED_SCALE_PRODUCTS`, once for SriMart with a new `SEED_SCALE_PRODUCTS_SRIMART`. Both are
opt-in and unset by default, so no existing environment changes behaviour by this existing.

**Separate vars per vendor, deliberately.** One shared count would be simpler, and is wrong here
for two reasons. The catalogues are different sizes (27 subcategories against 4), so one number
cannot mean "about two each" for both. And `#489`'s recorded NFR baseline is defined by the Aheed
row count specifically — letting a single value drive both would silently change what that
measurement refers to.

**`SEED_REMOVE_GENERATED` now removes both vendors' generated rows.** It called
`removeGeneratedCatalogue(AHEED_VENDOR_ID)` only. Left alone, the documented undo would have
silently stranded SriMart's generated products, which is worse than not having the feature.

**Production is seeded and its images filled** — `SEED_SCALE_PRODUCTS=54` (2 per Aheed
subcategory) and `SEED_SCALE_PRODUCTS_SRIMART=8` (2 per SriMart subcategory), then
`scripts/fill-product-images.ts` over the 62 new rows so each carries its own image rather than
the single shared placeholder per subcategory that `seedGeneratedCatalogue` writes.

## The trade-off this slice accepts, explicitly

`prisma/generate-catalogue.ts` produces deliberately generic names — "Everyday Rice", "Value
Chickpeas" — and its own docstring states that a generated row reading like genuine vendor
merchandising is "exactly the confusion `#239` was filed over". **These rows are therefore not real
merchandising, and they are now in a live production storefront.**

That is accepted here because the purpose is to see what a populated storefront looks like, and
because the undo is one command (`SEED_REMOVE_GENERATED=1`, now covering both vendors). Whether the
second tier eventually gets curated real products is a content decision this slice does not make
and does not foreclose.

## Deliberately excluded

- **Curating real products for 31 subcategories.** That is content authoring, not this slice.
- **Any change to `generate-catalogue.ts`** — its `GENERATOR_SEED`, slug prefix, and word pools are
  untouched. Changing the seed value invalidates `#489`'s recorded NFR measurement.
- **Raising or removing the top-level fixture's product counts.** The top tier was already correct.
- **`#519`** (stale staging hosts in production's `VendorDomain`) and **`#364`** (PNG bytes under a
  `.webp` key), both filed and both out of scope.

## Open items carried forward

- The six S3/CDN secrets for the `production` GitHub environment, still outstanding from `#518`,
  without which `.github/workflows/fill-product-images.yml` cannot run on its schedule.
- **A GitHub Actions `schedule:` only fires on the repository's default branch.** That workflow is
  on `staging` and will not run on a timer until it reaches `main`.
