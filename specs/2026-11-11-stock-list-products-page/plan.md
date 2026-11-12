---
id: 2026-11-11-stock-list-products-page-plan
title: "Stock list on staging, Products page paging and bulk quantity, honest savings framing (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-11
visibility: internal
summary: "Applies the client's 'Stock to upload' list to Aheed staging (category, Untracked stock, activate priced lines only), rebuilds /staff/products paging (numbered pages, 25/50/100, sort, needs-attention filters, bulk quantity) and adds honest savings framing to storefront prices."
tags: [catalogue, staff-panel, products, inventory, pricing, storefront]
related: [2026-11-10-db-warmup-ping-plan]
---

# Stock list, Products page, savings framing (plan)

Issue **#1523**. Owner request 2026-11-11 with the client's POS export `Stock to upload.xlsx`.
Owner decisions given in chat: page sizes 25/50/100 with **no "All"**; activate **only products
with a price**; products go into **the spreadsheet's categories**, reusing existing ones (no
duplicate categories); everything in **one slice**.

**Goal:** the client's fish and produce list is live on staging in the departments shoppers browse.
Staff can find, page through and restock thousands of products quickly, and shoppers see what
an offer saves them, computed only from prices the store actually charges.

## Evidence (read-only, AFC staging `ep-super-cherry`, 2026-11-11)

- The workbook has 6,168 rows, but only **100 are products** (52 Fish, 46 Fruit & Veg, `STELLA BOTTLE`,
  `ANGEL SLICES 5`). The rest are blank rows and POS totals. 93 rows carry no price.
- **All 100 already exist** in Aheed's staging catalogue. The owner's price list (#1330, loaded by
  `scripts/catalogue-load-price-list.ts`) created them under corrected spellings, for example "Pangasus filler" →
  "Pangasius Fillet", "Bottle guard" → "Bottle Gourd", "Jappaness" → "Diamond Japanese Fish – 1kg".
  The spreadsheet follows that list's order row for row. **Nothing is created.**
- The spreadsheet's categories exist: Fish & Seafood › **Frozen Fish**, Fruit & Vegetables ›
  **Fresh Vegetables** / **Fresh Fruit**, all active. Several current homes (Prawns, Crab, Squid &
  Seafood, Fillets & Smoked Fish, Onions, Potatoes & Roots) are **inactive**, so a product switched on
  there is invisible to shoppers.
- About 40 produce lines are priced £0.00 and stay hidden. `STELLA BOTTLE` is `AGE_RESTRICTED` and
  cannot be activated (database CHECK constraint).

## Scope

**A. Data: `scripts/catalogue-apply-stock-list.ts`** (staging run; production is not touched).
- Input is a curated JSON in the gitignored `.import-reports/`: each spreadsheet row with its
  department/sub-department and the **exact product name(s)** it maps to. Client data stays out of
  the repository, matching the price-list loader.
- Per mapped product: move it to the row's target category (resolved by slug from the sub-department,
  which must already exist; the script never creates a category), set `Inventory.stockMode = UNTRACKED`
  (upsert, audited `EXCEL_IMPORT`), and set `isActive = true` **only** when `basePrice > 0` and
  `restriction IS NULL`. Everything else is reported as "price needed" or "restricted".
- A mapped name that matches 0 or 2+ products is skipped and reported, never guessed. Dry run by
  default; `--apply` needs `--confirm-host <host>`, and a production secrets file also needs
  `--production`, the same guard pattern as the other catalogue scripts.
- Rows whose spreadsheet category is outside Fish / Fruit & Veg (`ALCOHOL`, `CAKES`) keep their
  existing category (Alcohol, Cakes & Desserts). The "related category already exists" rule applies,
  and the archived `CAKES` category is not reused.

**B. `/staff/products`** (`app/(admin)/staff/products/page.tsx`).
- The search box gets its own full-width row. It matches name, **PLU** or **barcode**.
- **Numbered pagination** above and below the list: "Page X of Y", "Showing a–b of N products",
  Previous/Next, a compact page-number window, and a jump-to-page box. It is offset-based
  (`page` query param) with a total count, via a new repository function
  `listProductsForAdminPage` in `lib/repositories/products.ts`. The cursor function stays, because the
  bundle picker uses it. Offset paging is a **standing-decision change**: it is recorded as a second
  scoped exception under "Pagination" in `specs/architecture.md` (1.49.0).
- Page sizes **25 / 50 / 100** (`PER_PAGE_OPTIONS`). No "All".
- **Sort:** newest (default, the current order), name A–Z, price low→high, price high→low.
- **Needs-attention filter** (`needs`): price needed (£0), ready to switch on (hidden, priced,
  unrestricted), no image.
- Each row shows a "Price needed" badge at £0, the was-price and markdown % when on offer, and the
  multi-buy tier.
- **Bulk quantity:** each row has a quantity box, and a "Set selected to N" control uses the existing
  selection checkboxes. One **Save quantities** submits only rows whose value changed. The server
  writes all of them in one interactive transaction (`getPrismaWs()`, new repository function
  `bulkSetInventoryQuantities`), with the same rules as `quickUpdateInventory`: no negatives, entering
  a count makes the product TRACKED, and every change gets an `InventoryAuditLog` row with source
  `STAFF_ADJUSTMENT`. The server re-reads current values, so an unchanged quantity writes nothing.

**C. Storefront savings framing.** One pure module, `lib/price-psychology.ts`:
- `savingLabel(original, base)` → "Save £1.00 (20%)". The percentage is rounded **down**, so it is
  never overstated.
- `multiBuyLabel(base, tier)` → "4 for £18.00 · save £2.00". The saving is `tierSavingPence`, which is
  never negative, and is omitted at £0.
- Used by `ProductCard`, `QuickViewDrawer` and the product page in place of their hand-built strings.

## Principles applied, and their limits

- **Staff page (cognitive load):** chunking (search row, then filters), a visible system status
  (page X of Y, counts), defaults that preserve today's behaviour, attention filters that surface the
  next job, and bulk actions that preview changed rows only.
- **Shopper (pricing psychology):** concrete savings framing (absolute £ plus a % for markdowns, the
  money saved for multi-buys) and unit-price clarity, which already exists.
- **Not done, deliberately:** fake urgency or countdowns, invented scarcity ("only N left" stays tied
  to real TRACKED stock, #1211), unverified reference prices, drip pricing, and default-checked
  upsells. Under the UK Consumer Protection from Unfair Trading Regulations and the DMCC Act 2024 these
  are unlawful or high-risk. Every claim shown is derived from stored prices.

## Deliberately excluded

- **Production data.** The store is pre-launch and every production product is hidden by design.
  The production run goes through the owner later, with the rest of the S1 run order.
- Prices for £0 produce. These are owner input, still outstanding.
- Merging the legacy POS duplicates (e.g. `TILAPIA FILLET` in Frozen Food). These are the
  25 near-duplicate merges already pending with the owner.
- An "All" page size (owner decision).
- Product thumbnails in the staff list, and inline price editing.

## Open items

- £0 produce prices and photos (owner).
- The production run (owner-run command, after approval).
