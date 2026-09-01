---
id: subcategory-products
title: "Products in every subcategory, for both vendors (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: Every one of production's 31 subcategories was empty because the curated fixture assigns all its products to top-level categories; both vendors' second tier is now filled with curated, category-appropriate products and their own images.
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

**`prisma/seed.ts`** is the only file changed.

**Curated products, keyed on subcategory slug.** `AHEED_SUBCATEGORY_PRODUCTS` (27 keys) and
`SRIMART_SUBCATEGORY_PRODUCTS` (4 keys) each hold two real products per subcategory, with genuine
names, prices in pence, unit labels, descriptions and the halal/fresh flags where they apply.
SriMart's are electronics and homeware; Aheed's are groceries appropriate to their department.
`seedSubcategoryProducts(vendorId, map)` creates them, uploading each placeholder object before
writing its row (#502's ordering rule) and skipping any key with no matching category — which is
what lets one vendor's fixture sit harmlessly in a run that seeds only the other.

**A flat record rather than nesting products inside `CATALOGUE`'s `children`.** The subcategory
tree already lives there; duplicating it would create two places that must agree. Keying on the
child slug means the map is resolved against the database, not against the fixture's shape.

**`seedGeneratedCatalogue` stays Aheed-only, and `SEED_SCALE_PRODUCTS_SRIMART` does not exist.**

**`SEED_REMOVE_GENERATED` removes both vendors' generated rows.** It called
`removeGeneratedCatalogue(AHEED_VENDOR_ID)` alone; production had SriMart generated rows to undo,
and a documented one-command undo that silently strands half the set is worse than none.

## The first implementation was wrong, and why

This slice initially filled the second tier with `generateProducts` output. That was wrong in two
ways, both inherent to that generator rather than settings on it:

1. **It relates a product to nothing.** It draws a noun from one global pool and assigns it to a
   random subcategory, so production briefly showed "Everyday Rice" under `cleaning` and "Premium
   Chickpeas" under `paper-toiletries`. Its own docstring says the pools are "deliberately generic
   grocery vocabulary rather than anything resembling a real Aheed or SriMart product" — it exists
   to make queries work harder.
2. **That pool is groceries-only**, so pointing it at SriMart, an electronics vendor, produced
   "Value Lentils" under `sri-chargers-cables`.

The lesson worth keeping: a fixture built to exercise query cost is not a fixture for looking at,
and the two requirements are not close enough to substitute. `generate-catalogue.ts` is untouched;
its `GENERATOR_SEED` is load-bearing for #489's reproducible measurement.

**A second, quieter defect surfaced from the fix itself.** `orange-juice-1l` in the new fixture
collided with an existing top-level Beverages product. Product slugs are unique per vendor and
`seedSubcategoryProducts` filters pending products by existing slug, so the collision **silently
seeded one fewer row** instead of failing — `juices-soft-drinks` shipped with a single product until
it was noticed by counting. It is now `apple-juice-1l`, a genuinely different product, with a
comment saying why.

## Deliberately excluded

- **More than two products per subcategory.** Two is enough to see the tier render and to prove the
  navigation resolves; a fuller catalogue is merchandising work with a different owner.
- **Any change to `generate-catalogue.ts`** — its `GENERATOR_SEED`, slug prefix, and word pools are
  untouched. Changing the seed value invalidates `#489`'s recorded NFR measurement.
- **Raising or removing the top-level fixture's product counts.** The top tier was already correct.
- **A give-up path for products the image pipeline can never fill (`#523`).** One product,
  `Halal Chicken Thighs 1kg`, is refused by Workers AI as NSFW on every attempt and keeps its
  placeholder. Fixing that — and stopping the scheduled job from retrying such products forever —
  is its own slice.
- **`#519`** (stale staging hosts in production's `VendorDomain`) and **`#364`** (PNG bytes under a
  `.webp` key), both filed and both out of scope.

## Open items carried forward

- The six S3/CDN secrets for the `production` GitHub environment, still outstanding from `#518`,
  without which `.github/workflows/fill-product-images.yml` cannot run on its schedule.
- **A GitHub Actions `schedule:` only fires on the repository's default branch.** That workflow is
  on `staging` and will not run on a timer until it reaches `main`.
