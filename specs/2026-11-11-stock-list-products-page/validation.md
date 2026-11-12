# Stock list, Products page, savings framing (validation)

Testing is risk-based. The pure modules (query parsing, page window, price labels, quantity
parsing) are unit-tested. The data script is proven by dry run, then the staging run and a
read-only check. The page and bulk quantity are checked under `npm run preview` (they touch the
database).

## Validation Steps

| Req | How to verify |
| --- | --- |
| R1 | `npx tsx scripts/catalogue-apply-stock-list.ts secrets/afc-staging.vars AFC_DIRECT_URL --vendor-slug aheed-food-centre --list .import-reports/aheed-stock-to-upload-2026-11-11.json` (main checkout's `.import-reports/`) prints one line per row with an action word, and ends `DRY RUN — nothing written`. |
| R2 | The same command with `--apply` and no `--confirm-host` exits non-zero before connecting writes. With `secrets/afc-production.vars` plus `--apply --confirm-host <host>` but no `--production`, it exits non-zero. |
| R3 | `grep -nE "category\.(create|upsert)|product\.(create|upsert)" scripts/catalogue-apply-stock-list.ts` returns nothing. A list naming a non-existent target slug aborts with "unknown category" (unit test in `tests/catalogue-apply-stock-list.test.ts`). |
| R4, R5 | `tests/catalogue-apply-stock-list.test.ts` (pure plan function): a priced unrestricted product plans `activate`, a £0 one plans `price needed`, a restricted one plans `restricted`, and none plans deactivation. |
| R6 | Read-only re-run of the dry run after the apply: every matched row reports its target category as current, stock `UNTRACKED`, and `already active` or `price needed`/`restricted`. Category count printed before and after is equal. |
| R7 | `tests/staff-products-query.test.ts`: `perPage` 50 → 50, 1000 → 25, `all` → 25. |
| R8 | Under `npm run preview`, sign in as staging admin, open `/staff/products`: the search input is on its own row. Search a known PLU (e.g. `12670`) and the STELLA BOTTLE row is listed. Unit test: `productSearchWhere` ORs name/plu/barcode. |
| R9 | `tests/staff-products-query.test.ts`: `page=abc` → 1, `page=0` → 1. `tests/staff-products-pagination.test.ts`: `clampPage(999, 3)` → 3, and the page window has an ellipsis shape. In preview, two `data-pagination` bars are present, each with "Page 1 of". |
| R10 | Unit test: `staffProductsHref` with every param set round-trips through `parseStaffProductsQuery` to the same query. |
| R11, R12 | Unit tests on `parseStaffProductsQuery` for valid and unknown `sort`/`needs`. Unit test on the repository `orderBy`/`where` builders. |
| R13 | In preview, filter `needs=price`: every row shows "Price needed". |
| R14–R16 | `tests/bulk-quantity.test.ts` (pure `parseBulkQuantityForm`): rejects -1, 1.5, 100001; keeps only changed rows. Repository test with a fake `$transaction` client asserts one transaction, an audit per change, and the unchanged row skipped. In preview, change two quantities and Save: the message says "2 updated", and reload shows the new numbers. |
| R17 | `npx vitest run tests/staff-nav-parity.test.ts tests/page-container.test.ts` pass. In preview the Make available bulk preview still renders. |
| R18 | `tests/price-psychology.test.ts`: `savingLabel(500, 400)` = `Save £1.00 (20%)`; `savingLabel(300, 200)` = `Save £1.00 (33%)`; `savingLabel(400, 400)` null; `multiBuyLabel(500, {4, 1800})` = `4 for £18.00 · save £2.00`; a tier priced at base total gives no "save". |
| R19 | `grep -n "multiBuyLabel\|savingLabel" components/product/ProductCard.tsx components/product/QuickViewDrawer.tsx "app/(storefront)/products/[slug]/page.tsx"` lists all three files. |
| R20 | `git diff origin/staging -- components app lib \| grep -iE "hurry\|only .* left\|ends in\|countdown"` adds nothing. |
| R21 | `git diff origin/staging -- CHANGELOG.md` shows the #1523 entry. |
| R22 | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run --maxWorkers=4` all exit 0. CI green on the PR. |
