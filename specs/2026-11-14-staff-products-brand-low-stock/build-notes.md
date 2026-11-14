# Staff products: brand filter/sort, low stock, store-wide threshold (build notes)

Issue #1572. Built 2026-11-14 in worktree `E:\GitRepositories\aheed-wt-1558`, branch
`feature/1572-products-brand-low-stock`.

## What changed from the plan

- **R4:** low stock is a fourth Needs-attention worklist (filter select and quick view), not a fifth
  stock-mode option: the stock filter maps to `Inventory.stockMode`, and low stock is a state of a
  TRACKED row.
- **Brand list is an optional third argument** to `parseStaffProductsQuery`. 52 existing calls pass
  two arguments; with no list a brand id resolves to no filter, never to another store's brand.

## Verification so far

- Field reference over `PrismaNeonHttp` on AFC staging (read-only probe, local
  `.import-reports/1572/`): `quantity <= lowStockThreshold` counted 6,299 rows by the database and
  6,299 in memory; `>` counted 1 and 1. The low-stock filter itself returned 0 (only one tracked
  product on AFC staging, above its threshold).
- Brand sort on AFC staging: ascending by brand name, 4,772 products with no brand.
- `tests/staff-products-brand-low-stock.test.ts` plus the related suites: 96 tests pass.

## Open

- The migration reaches AFC staging when CI deploys staging; the store-default save is then checked
  there (3 → 4 → 3).
- The shared `node_modules/.prisma` client was regenerated from this branch's schema (worktree uses
  a junction to the main checkout). Additive only; the main checkout regenerates it on its next
  `npm run db:generate`.
