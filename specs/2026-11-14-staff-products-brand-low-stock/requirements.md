# Staff products: brand filter and sort, low stock, store-wide low-stock threshold (requirements)

Issue #1572. Owner request 2026-11-14, approved the same day.

## Problem

`/staff/products` shows a brand label but cannot filter or sort by brand, and there is no way to
find products that are running low. `Inventory.lowStockThreshold` exists per product (default 3),
but there is no store-wide default: every stock record is created with a hard-coded 3, and
`listInventoryForStaff` falls back to 5 when a product has no stock record.

## Requirements

- **R1** — `/staff/products` has a **Brand** filter: any brand, "No brand", or one of this store's
  brands. A brand id that is not this store's resolves to no filter (same rule as the category
  filter).
- **R2** — `/staff/products` has a **Brand A–Z** sort; products with no brand come last, ties broken
  by name then id.
- **R3** — **Low stock** is: stock TRACKED, quantity greater than 0 and at or below the product's own
  threshold. Out of stock (0) is not low stock (matches `getCatalogueHealth`).
- **R4** — The **Needs attention** filter and the Quick views gain **Low stock** (one worklist, two ways in, like the other three).
- **R5** — A low-stock product shows a **Low stock** label on its row; every tracked product shows
  its threshold ("Low at 3").
- **R6** — Each row shows the **price per kg / litre / 100 g** when net content is known, derived
  with `deriveUnitPriceLabel` (never the stored sort key).
- **R7** — `VendorConfig.lowStockThreshold` (integer, default 3) is the **store-wide default**.
  A store with no config row uses 3.
- **R8** — A store admin can change the store default on `/staff/products` (0–999 whole number).
  STAFF members see the value but not the control, and the server action refuses them.
- **R9** — Saving a new store default also moves **every product still on the old default** to the
  new one; a product with its own number keeps it. The form says so. One transaction.
- **R10** — Every path that **creates** a stock record uses the store default instead of a literal 3:
  the product form's starting value for a new product, quick stock update, bulk quantity save,
  the spreadsheet import (`lib/catalogue-import/apply.ts`), the restriction "mark untracked" bulk
  action, and `scripts/stock-import.ts`.
- **R11** — `listInventoryForStaff` falls back to 3 (the schema default), not 5.
- **R12** — Filters, sort and quick views survive pagination (href round-trip), like every existing
  filter.

## Out of scope

- Storefront changes ("Only N left" already uses the per-product threshold).
- Low-stock email alerts.
- Making `Inventory.lowStockThreshold` nullable ("follow the store default"): R9 gives the same
  result without a data migration on every stock row.
