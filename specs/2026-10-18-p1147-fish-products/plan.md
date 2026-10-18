---
id: p1147-fish-products
title: "Fish products: 18 reviewable products under Fresh Fish and Frozen Fish (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-18
visibility: internal
summary: "Issue #1147: stock the empty Fish department with 18 realistic products through a tested data module and a dry-run-by-default script that creates them hidden with zero stock, plus the same products in the dev seed. Data only; no schema change and no live prices."
tags: [fish, catalogue, seed, scripts, p10]
related: [p1131-storefront-navigation-catalogue, p1142-header-dropdown-search-room]
---

# Fish products: 18 reviewable products under Fresh Fish and Frozen Fish (plan)

Issue `#1147`. The owner approved the proposal on 2026-10-18. Decisions already taken, recorded on the
issue: targets are the dev seed, staging and production; production products are created **hidden**
(switched off) with **zero stock**; the assistant drafts the products and the owner reviews them
before anything is written.

**Goal:** the Fish department that `#1131` created empty gets realistic products, in a form the owner
can review as a dry run and re-run safely on any environment, without a live shop ever offering a
product at an invented price.

## What Orient found

Facts about `origin/staging` at `66b25d5` on 2026-10-18.

1. **Fish ships empty on purpose.** `FISH_DEPARTMENT` in `prisma/department-changes.ts` has
   `products: []`, and `scripts/apply-department-changes.ts` creates the department, `fresh-fish` and
   `frozen-fish` on staging and production. That script is the precedent: a pure module, a
   dry-run-by-default Node script against `DIRECT_URL` that prints the target host first, and no raw
   SQL.
2. **The dev seed already has a pass for subcategory products.** `seedSubcategoryProducts` in
   `prisma/seed.ts` takes `AHEED_SUBCATEGORY_PRODUCTS`, a map keyed on the subcategory slug, is
   idempotent per product slug, and uploads each product's placeholder image. `seedCatalogue` is the
   wrong hook: it attaches products to the department row and skips a category that exists.
3. **Product creation has one owner.** `createProductForVendor(prisma, vendorId, input)` in
   `lib/repositories/products.ts` takes its client explicitly, derives the stored unit-price sort key,
   nests the inventory row in the same implicit transaction and reports a duplicate slug as a result,
   not a crash. The script reuses it instead of re-implementing those rules. A nested create must go
   through the WebSocket adapter, which is what `apply-department-changes.ts` already constructs.
4. **A product with no image already renders.** `ProductCard`, `ProductImage` and
   `ProductImageGallery` degrade to the grey box. So the first run adds no images.
5. **Unit price is derived, not typed.** With net content set, the shop shows
   `deriveUnitPriceLabel(basePrice, netContent)` (`components/product/unit-price.ts`) and ignores the
   typed unit label; without it, the typed label shows. Net content is a whole number in its own unit,
   so a kilo is `1000` grams.
6. **Claims have a history here.** `#239` asserted a certification a vendor had no basis for. The
   catalogue form refuses an HMC flag without a reference. Fish products therefore carry no origin,
   brand, halal, organic, fresh, vegetarian, gluten-free or HMC value.

## Design

**Three pieces, one data source.**

- `prisma/fish-products.ts` (pure, no Prisma client, no I/O): `FISH_PRODUCTS` (the 18 products below)
  and `planFishProducts(state)`, which turns "the vendor's categories and existing product slugs" into
  a list of `create-product` changes, notes, and a `blocked` reason when the Fish tree is incomplete.
  Idempotent by construction: a plan computed after its own changes is empty. Only creates; there is no
  update or delete change kind.
- `prisma/fish-products-write.ts` (no Prisma import): `writeFishProductChanges`, which takes the
  create function as an argument and applies the changes one at a time. It exists so the failure
  handling can be tested with a fake create function instead of a database.
- `scripts/add-fish-products.ts --vendor <slug> [--apply] [--active] [--stock N]`: reads the vendor,
  prints the plan, writes only with `--apply`. Dry run is the default. Prints
  `target database host: <host>` before connecting. Creates through `createProductForVendor`.

**Defaults protect a live shop.** Products are created with `isActive` false and quantity 0. `--active`
and `--stock N` are explicit. The owner switches a product on with the existing "Visible in the shop"
control after checking its price, photo and stock.

**Dev seed.** `AHEED_SUBCATEGORY_PRODUCTS` gains `fresh-fish` and `frozen-fish`, built by the module's pure
`toSeedProducts()` from `FISH_PRODUCTS`, so the seed and the script cannot disagree about a name, slug or price. Seeded
products are active with quantity 20 and the placeholder image, like every other seeded product. The
seed pass does not store net content, so dev shows the stored unit label, which the module computes
with `deriveUnitPriceLabel` and so reads the same as the derived one.

**The 18 products** (indicative prices; the owner corrects them at review):

| Slug | Name | Subcategory | Price (pence) | Net content |
|---|---|---|---|---|
| atlantic-salmon-fillets-240g | Atlantic Salmon Fillets 240g | fresh-fish | 499 | 240 GRAM |
| cod-fillets-400g | Cod Fillets 400g | fresh-fish | 649 | 400 GRAM |
| sea-bass-fillets-260g | Sea Bass Fillets 260g | fresh-fish | 499 | 260 GRAM |
| whole-sea-bream | Whole Sea Bream | fresh-fish | 399 | 1 EACH |
| whole-tilapia | Whole Tilapia | fresh-fish | 349 | 1 EACH |
| whole-mackerel-2-pack-500g | Whole Mackerel (2) 500g | fresh-fish | 329 | 500 GRAM |
| whole-rainbow-trout | Whole Rainbow Trout | fresh-fish | 349 | 1 EACH |
| raw-king-prawns-300g | Raw King Prawns 300g | fresh-fish | 599 | 300 GRAM |
| whole-silver-pomfret-800g | Whole Silver Pomfret 800g | frozen-fish | 699 | 800 GRAM |
| rohu-steaks-1kg | Rohu Steaks 1kg | frozen-fish | 749 | 1000 GRAM |
| hilsa-ilish-cuts-1kg | Hilsa (Ilish) Cuts 1kg | frozen-fish | 1499 | 1000 GRAM |
| whole-tilapia-1kg | Whole Tilapia 1kg | frozen-fish | 549 | 1000 GRAM |
| kingfish-seer-steaks-1kg | Kingfish (Seer) Steaks 1kg | frozen-fish | 999 | 1000 GRAM |
| basa-fillets-1kg | Basa Fillets 1kg | frozen-fish | 599 | 1000 GRAM |
| frozen-cod-fillets-800g | Cod Fillets 800g | frozen-fish | 749 | 800 GRAM |
| raw-king-prawns-peeled-500g | Raw King Prawns Peeled 500g | frozen-fish | 699 | 500 GRAM |
| salmon-fillets-4-pack-500g | Salmon Fillets 4 Pack 500g | frozen-fish | 649 | 500 GRAM |
| squid-rings-500g | Squid Rings 500g | frozen-fish | 399 | 500 GRAM |

Descriptions are one plain factual sentence naming the cut or form, then a final allergen sentence:
`Contains: Fish.`, `Contains: Crustaceans.` (the two prawn lines) or `Contains: Molluscs.` (squid).
Nothing else is claimed.

**Rollout.** Every production step is run by the owner; this session and the validator have no
production credentials.

1. Merge to `staging`. On staging, dry run, then
   `npx tsx scripts/add-fish-products.ts --vendor aheed-food-centre --apply --active --stock 10`
   with `DIRECT_URL` from `secrets/staging.vars`. Review the Fish pages and the prices.
2. Promote `staging` to `main` (this also carries `#1131`, `#1142` and `#1145` to production).
3. On production, in this order: `scripts/apply-department-changes.ts --vendor aheed-food-centre --apply`
   (creates Fish and sets the placeholder), then
   `scripts/add-fish-products.ts --vendor aheed-food-centre --apply` (hidden, zero stock).
4. Owner sets price, photo and stock per product, then ticks "Visible in the shop".

## Deliberately excluded

- **Images.** The first run stores none (a storage key must exist in the bucket, and a placeholder key
  would have to be uploaded to production). Staff upload photos, or run `fill-product-images`.
- **Origin, brand, halal, organic, fresh, vegetarian, gluten-free, HMC, MSC.** Unsupported claims
  about a real product; the owner sets any that are true.
- **Updating existing products.** The script only creates. A re-run never overwrites an edit made in
  the staff panel.
- **A bulk-import screen, a migration, or a new dependency.** Rejected at Propose.
- **Other vendors.** SriMart sells electronics. The seed map and the script touch only the vendor named.
- **Search synonyms, bundles, promotions or featuring** for the new products.

## Open items carried forward

- **Prices and weights are indicative.** The owner reviews them on staging (step 1). A wrong price
  found there is a one-line change to `FISH_PRODUCTS` in a follow-up, or an edit in the staff panel.
- **The two documentation branches.** `docs/p1142-merged-handoff` edits `docs/model-handoff.md`. This
  slice does not edit that file, to avoid a conflict; the Document stage updates it after that branch
  merges.
- **Type compatibility.** `createProductForVendor`'s client type is the wasm client; the script uses the
  Node client from the bare specifier. If the two types do not line up, Build records the smallest
  typed adaptation as a deviation and does not copy the rule logic.
