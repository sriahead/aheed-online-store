# Stock list, Products page, savings framing (requirements / acceptance criteria)

Issue #1523. Applies the client's stock list to Aheed **staging** without creating products or
categories, rebuilds `/staff/products` navigation and adds bulk quantity editing, and adds honest
savings framing to storefront prices. See `plan.md` for evidence and owner decisions.

## A. Stock list (data)

R1. `scripts/catalogue-apply-stock-list.ts` exists. Run without `--apply` it writes nothing and
    prints, per row, the matched product, its current and target category, and one of
    `activate`, `price needed`, `restricted`, `already active`, `skipped (no match)` or `skipped (ambiguous)`.
R2. With `--apply`, the script refuses to run unless `--confirm-host` equals the database host, and
    for a production secrets file (name contains `production`) also requires `--production`.
R3. The script never creates a `Category` or a `Product`. A target category slug that does not exist
    for the vendor aborts the run before any write.
R4. For every matched product the script sets `categoryId` to the row's target category, upserts
    `Inventory.stockMode = UNTRACKED`, and writes an `InventoryAuditLog` row (`source = EXCEL_IMPORT`)
    whenever the stock mode changes.
R5. The script sets `isActive = true` only for a matched product with `basePrice > 0` and
    `restriction IS NULL`, and never sets `isActive = false`.
R6. After the staging run, on AFC staging (`ep-super-cherry`), every mapped Fish row's product is in
    category `frozen-fish`, every Fresh Vegetables row's product is in `fresh-vegetables`, and every
    Fresh Fruit row's product is in `fresh-fruit`. Each has stock mode `UNTRACKED`, and each priced
    unrestricted one is active. No £0 product is active. The vendor's category count is unchanged.

## B. /staff/products

R7. `PER_PAGE_OPTIONS` is exactly `[25, 50, 100]`. Any other `perPage` value resolves to 25.
R8. The page renders the search input in its own row, separate from the filter selects. The search
    matches product name, PLU or barcode (case-insensitive, contains).
R9. The page renders a pagination bar both above and below the list. Each bar shows "Page X of Y"
    and "Showing a–b of N". A `page` query param beyond the last page resolves to the last page, and
    a non-numeric or < 1 value resolves to 1.
R10. Every pagination, sort and filter link preserves all other active query params
     (`status`, `q`, `category`, `restriction`, `stock`, `perPage`, `sort`, `needs`).
R11. `sort` accepts `newest` (default), `name`, `price-asc` and `price-desc`. Any other value is
     `newest`, which keeps the existing order (`createdAt desc, id desc`).
R12. `needs` accepts `price` (basePrice = 0), `ready` (inactive, basePrice > 0, unrestricted) and
     `image` (no ProductImage). Any other value applies no filter.
R13. A product with `basePrice = 0` shows a "Price needed" badge in the list.
R14. Each list row has a quantity input. Submitting "Save quantities" updates only products whose
     submitted quantity differs from their stored TRACKED quantity, sets them TRACKED, and writes one
     `InventoryAuditLog` (`STAFF_ADJUSTMENT`) per changed product, all inside one
     `getPrismaWs()` interactive transaction. The result message reports the updated and unchanged
     counts.
R15. "Set selected to N" fills the quantity input of every selected row with N, and the same Save
     submits them.
R16. A negative, non-integer or above-100000 quantity is rejected with a message and nothing is
     written. A product id not belonging to the vendor is skipped and reported.
R17. The page still requires `requireVendorRole("STAFF", "ADMIN")` and renders `PanelRefusal` on
     refusal. Existing bulk actions (Make available / Hide / Mark not tracked) still work.

## C. Storefront savings framing

R18. `lib/price-psychology.ts` exports `savingLabel(originalPence, basePence)`, which returns
     `"Save £X.XX (P%)"` with P rounded down, or null when there is no saving. It also exports
     `multiBuyLabel(basePence, tier)`, which returns `"Q for £Y.YY · save £Z.ZZ"`, drops the
     " · save …" part when the saving is 0, and returns null when the tier is not applicable.
R19. `ProductCard`, `QuickViewDrawer` and `app/(storefront)/products/[slug]/page.tsx` render
     multi-buy text through `multiBuyLabel`. The product page discount badge and the card's
     "Save" badge render through `savingLabel`.
R20. No new urgency, countdown, or scarcity copy is introduced. Low-stock copy remains gated by
     `showsLowStock`.

## Gates

R21. `CHANGELOG.md` updated (Gate 4).
R22. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
