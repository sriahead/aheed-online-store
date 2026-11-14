# Staff products: brand filter/sort, low stock, store-wide threshold (validation)

| Req | How to verify |
| --- | --- |
| R1, R2, R4, R12 | `tests/staff-products-brand-low-stock.test.ts`: the parser accepts `brand=none`, a known brand id, refuses a foreign id; `sort=brand` and `stock=LOW`/`needs=low` round-trip through `staffProductsHref`. |
| R3 | `tests/staff-products-brand-low-stock.test.ts`: `isLowStock` — 0 is not low, threshold is low, untracked/unknown never low. |
| R5, R6, R8 | Page source test: the Low stock label, "Low at", `deriveUnitPriceLabel`, and the admin-only default form. |
| R7, R9 | Staging probe (`scripts/verify-low-stock-default.mts`, local): set 3→4 moves rows on 3 only, then back to 4→3. |
| R10, R11 | Source test: no `lowStockThreshold: 3` literal left in the create paths; inventory fallback is the shared default. |
| All | `npm run typecheck`, `lint`, `format:check`, `npx vitest run --maxWorkers=4`, `kms:validate`. |
