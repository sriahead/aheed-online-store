---
id: 2026-11-12-catalogue-copy-to-production-plan
title: "Copy the Aheed catalogue from staging to production, images included (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-12
visibility: internal
summary: "One script copies a cell's catalogue tables from its staging database to production by shared id, and copies image objects key for key, replacing the six-script production run order and any image regeneration."
tags: [catalogue, production, images, scripts]
related: [2026-11-11-stock-list-products-page-plan]
---

# Copy the Aheed catalogue from staging to production (plan)

Issue **#1523** (kept open for the production data run). Owner instruction, 2026-11-12: "Move the
data as well from staging to prod; instead of regenerating images, move the images as well."

## Evidence (read-only, 2026-11-12)

- AFC staging (`ep-super-cherry`) is a Neon branch of AFC production (`ep-weathered-leaf`),
  refreshed by "Reset from parent" (#1512). Rows that existed at the refresh carry the same id in
  both. The vendor id is the fixed `a4ed0000-0000-4000-a000-000000000001`.
- Staging's Aheed catalogue: 83 categories, 6,238 products (73 active), 7 multi-buy tiers,
  13 bundles (15 lines), 8 promotions, 146 brands, 1 attribute, 81 category assets,
  42 product-image rows, 104 stock and 54 restriction audit rows. No orders.
- Image keys embed row ids (`products/{productId}/{uuid}.png`, `categories/{vendorId}/…`), so with
  shared ids an object copies key for key. Of the 125 keys staging's rows use:
  - 84 are in both buckets;
  - 26 are only in `afc-images-production` (staging was serving them from there);
  - 11 are only in `afc-images-staging`, and these are what get copied;
  - 4 are in neither bucket. These are legacy product-image rows keyed by vendor id, broken on staging already.

## Scope

`scripts/catalogue-copy-staging-to-production.ts`:
- Copies one vendor's catalogue tables in dependency order: brands, attributes and options,
  categories (parents first), products, tiers, stock, attribute values, images, bundles and lines,
  promotions, category assets. It also appends the inventory and restriction audit trails.
- Rows are matched by id; stock and tiers by `productId`; attribute values by `(productId, attributeId)`;
  bundle lines by `(bundleId, productId)`. Only changed fields are written.
- Nothing is deleted except image rows and bundle lines, which are mirrored. Other
  production-only rows are reported and kept.
- `--activation keep-production|copy` is **required**. `keep-production` keeps production's on/off
  switch for products, bundles and promotions; new rows arrive off. `copy` takes staging's.
  A restricted product is off either way.
- Image objects missing from production's bucket are copied before any row is written. Image rows
  whose object exists in neither bucket are left alone on both sides.
- Guards follow the other catalogue scripts: dry run by default, hosts and buckets printed first,
  same host/bucket refused, `--apply --confirm-host <host> --production`. A unique clash or a
  missing outside reference stops the run before any write. The vendor id must match on both sides.

## Deliberately excluded

- Orders, customers, accounts, carts, reviews, vendor settings, domains.
- Deleting production-only catalogue rows (reported only).
- Running it against production. That is the owner's command, after a Neon backup branch.
