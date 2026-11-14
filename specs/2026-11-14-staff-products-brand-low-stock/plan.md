---
id: 2026-11-14-staff-products-brand-low-stock-plan
title: "Staff products: brand filter/sort, low stock, store-wide threshold (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-14
visibility: internal
summary: "Brand filter and sort, a Low stock filter/quick view/label and per-kg price on /staff/products, plus VendorConfig.lowStockThreshold as the store-wide default used by every stock-record create path."
tags: [catalogue, staff, inventory, brand]
related: [2026-11-14-staff-products-brand-low-stock-requirements]
---

# Staff products: brand filter/sort, low stock, store-wide threshold (plan)

Issue #1572. Requirements: `requirements.md`.

## Shape

- **Schema** — `VendorConfig.lowStockThreshold Int @default(3)`; one hand-authored additive migration
  (`ALTER TABLE … ADD COLUMN … DEFAULT 3`), so every existing store reads 3 and nothing changes.
- **`lib/low-stock.ts`** (pure) — `DEFAULT_LOW_STOCK_THRESHOLD`, `isLowStock()`,
  `parseLowStockThreshold()`.
- **`lib/repositories/vendor.ts`** — `getLowStockDefault(prisma, vendorId)` and
  `setLowStockDefault(prismaWs, vendorId, value)` (interactive transaction: read the old default,
  update the config, `updateMany` the inventory rows on the old default — WebSocket client, per the
  `updateMany` rule). `readLowStockDefault(tx, vendorId)` is the shared in-transaction read the
  create paths use.
- **`lib/staff-products-query.ts`** — `brand` parameter (`all` / `none` / a validated brand id),
  `brand` sort, `LOW` stock option, `low` quick view.
- **`lib/repositories/products.ts`** — `listProductsForAdminPage` gains `brandId` (`null` = no brand)
  and the low-stock `where`. Low stock compares two columns of `Inventory`, which Prisma expresses
  with a **field reference** (`quantity: { lte: prisma.inventory.fields.lowStockThreshold }`), so no
  in-memory id list and no raw SQL. Verified against AFC staging over the HTTP adapter the page uses.
- **Page** — brand select and sort, Low stock label, "Low at N", unit price, and a small store-default
  form (admins only) posting to a new action in `features/admin/catalogue.ts`.
- **Create paths** — each reads the store default inside its existing transaction (R10).

## Verification

Unit tests for the query parser, `isLowStock`, the threshold parser and the page source; a staging
probe script for the field-reference filter and the default update; the full gates.
