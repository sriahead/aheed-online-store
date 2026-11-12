# Stock list, Products page, savings framing (build notes)

Worktree: `E:\GitRepositories\aheed-wt-1523` (branch `feature/1523-stock-list-products-page`, from
`origin/staging` at `955cfe1b`). `node_modules` is a **junction** to the main checkout. Remove the
junction with `rmdir` before `git worktree remove`, or the main checkout's `node_modules` is emptied.

## What changed and why

- **Data (A).** `scripts/catalogue-apply-stock-list.ts` reads a curated JSON
  (`.import-reports/aheed-stock-to-upload-2026-11-11.json` in the **main checkout**, gitignored). Each
  spreadsheet row carries the exact product name(s), or the PLU, it maps to. The mapping was generated
  from the owner's price list (#1330), which the spreadsheet follows row for row, and resolved to exact
  Unicode names (en dashes). `planProduct` is the pure decision and is unit-tested. **Applied to AFC
  staging (`ep-super-cherry`) on 2026-11-11:** 104 products matched (White/Red Onion map to two sizes
  each and Garlic to three), 50 category moves, 104 set UNTRACKED with an `EXCEL_IMPORT` audit row each,
  59 activated, 44 "price needed", 1 restricted (STELLA). Categories 83 before and after. A post-apply
  dry run reports `{"restricted":1,"already active":59,"price needed":44}` with no planned writes.
  Aheed staging active products: 73 (the 14 earlier offers plus these 59), 0 of them at £0.
- **Products page (B).** `lib/staff-products-query.ts` gained `sort`, `needs`, `page`, `pageCount`,
  `clampPage` and `pageWindow`. `staffProductsHref(query, page)` takes a page number (it used to take a
  cursor). `lib/repositories/products.ts` gained `listProductsForAdminPage` (count, then skip/take,
  `take` capped at 100, search over name/PLU/barcode nested under `AND`, fragments via `combineWhere`)
  and `bulkSetInventoryQuantities` (one interactive transaction, vendor-scoped read, unchanged rows
  skipped, audit per change). The page uses `one()` to take the first value of a repeated parameter.
  New components: `StaffProductsPagination` (server, no JS) and `BulkQuantityBar` (client). The action
  is in `features/admin/product-quantities.ts` ("use server", async export only). Its contract and
  state are in `lib/bulk-quantity.ts`.
- **Savings framing (C).** `lib/price-psychology.ts` (`savingLabel`, `multiBuyLabel`) replaces the
  hand-built strings in `ProductCard`, `QuickViewDrawer` and the product page.
- **Docs.** `specs/architecture.md` 1.49.0 records the offset exception. The staff guide (2.19.0)
  covers finding products and bulk counts.

## Decisions taken during the build

- **Offset, not keyset, for this list only.** Numbered pages need random access. This is recorded as a
  scoped exception in architecture.md rather than left implicit. The cursor function is kept for the
  bundle picker (`app/(admin)/staff/bundles/[bundleId]/page.tsx`).
- **Count before page read, sequentially.** Clamping a stale page needs the total.
- **"Set selected to N" is client-side only.** It fills the boxes, and the same Save submits them, so
  there is one write path and one validation, not two.
- **Legacy-POS prices are treated as prices.** Parsley, Moringa, Lemons, Ripe Plantain, Watermelon
  (£0.79–£1.50) and Garlic – 40s (£3.00) carry prices kept from the old POS import, not from the
  owner's list. The owner said to activate products with a price, so they were activated. They are
  flagged to the owner in the hand-over.
- **ALCOHOL / CAKES rows keep their category** (`categoryMap` null): Alcohol and Cakes & Desserts
  already exist, and the archived `CAKES` category is not reused.

## Deviations from the spec

- R1's action words: the script prints `already active` and `skipped (no match)` / `skipped
  (ambiguous)` as specified, and the summary line also counts `category moved` and
  `stock set untracked`. This is additive.
- R6: the moves include products in `fish-fillets-smoked`, `prawns`, `crab-squid-seafood`,
  `herbs-salads` and `onions-potatoes-roots`, all into the spreadsheet's three categories, as the owner
  instructed. Those five subcategories are now emptier. None was deleted or deactivated.

## Known-shaky areas

- **`bulkSetInventoryQuantities` against a real WebSocket client** is only unit-tested with a fake
  `$transaction`, plus the preview check below. A 100-row save on a cold Neon compute is the timing
  risk (timeout 30 s).
- **The `data-changed:` Tailwind variant** on the Qty box depends on Tailwind v4 attribute variants.
  If the highlight does not show, the counts on the Save button still do.
- **`needs=image`** uses `images: { none: {} }`. It is correct by Prisma semantics but measured only on
  dev data.
- The product page and Quick View now say "Save £X (P%)". A test asserting old copy elsewhere would
  have failed. The full suite (443 files, 6,385 tests) passed.
