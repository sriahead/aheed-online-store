---
id: 2026-11-11-aheed-catalogue-s1-requirements
title: "Aheed catalogue S1: departments (S1b), restricted lines (S1c), real images (S1d) — requirements"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-11
visibility: internal
summary: "Acceptance criteria for making Aheed Food Centre's imported catalogue browsable and safe before go-live: map the till's GROCERIES/DEFAULT lines into real departments through a reviewed mapping, restrict the age-restricted and non-deliverable lines, and source real product images. Staging first; production only after the owner's approval."
tags: [catalogue, aheed, departments, restrictions, images, go-live]
related: [2026-10-22-catalogue-restrictions-stock-states-plan, architecture]
---

# Aheed catalogue S1 — requirements

Issues: S1b `#1330`, S1c `#1200`, S1d `#1515`; tracking `#1337`. Owner scope (2026-11-11): S1a
(sample clean-up) is **skipped**; S1b and S1c go ahead; S1d uses **real** product images only, and
where none exists the owner decides; S1e (go-live activation) **waits for the owner's approval**.
Every change runs on **staging first** (`afc-staging`, a Neon branch of production, `#1512`) and
reaches production only after the owner approves it there.

## Facts this spec rests on (read-only profile, 2026-11-11, staging = production copy)

- 6,104 products; 6,098 from the client's import of 2026-11-07 (`scripts/import-catalogue-batch.ts`),
  all inactive except `medium-chicken` (owner keeps it).
- The import kept the till's department only: `Groceries` holds 3,229 products and `DEFAULT` 1,060.
  The client's file (`docs/StockList.xls`, gitignored) carries a **SubDept** for GROCERIES (23
  sub-departments, e.g. BEVERAGES 790, OILS AND SPICES 509, PASTA / RICE 366); DEFAULT has none.
- `Product.plu` holds the till PLU, so a file row matches a product by `(vendorId, plu)`.
- The import did **not** apply ADR-007's restriction policy: no product has a `restriction`. The
  departments TOBACCO (26), ALCOHOL (1), INSTANT LOTTERY (1), PHONE CARDS (15), NEWS (5), E-PAY (1)
  and STAMPS (1) were imported unrestricted.
- The file's Barcode column is empty on all 6,160 lines.

## S1c — restricted lines (`#1200`)

R1. A script applies `DEFAULT_ADR007_POLICY.byDepartment` (`lib/catalogue-import/default-profile.ts`)
    to existing products by their category's department name (normalised as the importer does), and
    sets each matching product's restriction through `setProductRestriction` (`lib/repositories/
    product-restrictions.ts`) with source `IMPORT` and a reason naming the department and `#1200`.
    It only ever tightens: a product already at an equal or stricter restriction is left alone.
R2. The same run scans product names in the uncertain departments (`DEFAULT`, `MISC`) for
    restricted-goods keywords (tobacco, alcohol, lottery, phone/top-up cards, stamps, blades,
    lighter/gas refills) and sets `NEEDS_REVIEW` on each hit, so it cannot be switched on until a
    person clears it. The keyword list lives in one exported constant with a unit test per family.
R3. Dry run by default, printing per-department and per-keyword counts and every affected product
    (PLU, name, current → new restriction). `--apply` needs `--confirm-host` and refuses the
    production database unless `--production` is also given (staging first, `#1337`).
R4. Verified on staging: 27 `AGE_RESTRICTED`, 1 `PROHIBITED`, 22 `NOT_DELIVERABLE`, plus the
    `NEEDS_REVIEW` hits listed for the owner; one audit row per change; a re-run changes nothing.

## S1b — departments (`#1330`)

R5. A pure function maps one line `(tillDepartment, tillSubDepartment, name)` to a target
    `(department, subDepartment | null, rule)` using a rules table: till department → department,
    GROCERIES sub-department → department/sub-department, and name keywords for `DEFAULT` and the
    mixed sub-departments (e.g. OILS AND SPICES → *Cooking Oils* when the name says OIL, else
    *Spices & Masalas*). A line no rule matches maps to `Needs review` and keeps its current category.
R6. The rules table is data (`prisma/manifests/aheed-department-map.json`), reviewable in a PR, and
    names only departments — no product data. Its target departments reuse the store's designed
    categories (Bakery, Snacks, Dairy & Eggs, Beverages, Groceries and their sub-categories, …)
    wherever one fits; a new category is created only where none does, and is created **inactive**.
R7. `propose` mode reads the client's file and the database (read-only) and writes a review CSV
    outside the repository (`.import-reports/`): PLU, name, current category, till department, till
    sub-department, proposed department, proposed sub-department, rule. It prints a summary per
    target and the count left in `Needs review`.
R8. `apply --map <reviewed CSV>` moves each listed product to the department in the CSV (the owner
    may edit the CSV), creating missing categories inactive. It writes `Product.categoryId` only —
    no name, price, restriction or active flag changes. Dry run by default; `--apply` needs
    `--confirm-host`; production needs `--production`. One transaction per department.
R9. Verified on staging: `Groceries` and `DEFAULT` hold only the lines left in `Needs review`; the
    storefront's department pages list the moved products once activated (S1e); a re-run is a no-op.

## S1d — real images (`#1515`)

R10. No AI-generated image is attached to any S1 product.
R11. Blocked on the source of truth: the client's export has no barcodes. The owner chooses between a
     barcode export from the till (recommended; then an Open Food Facts lookup that writes a
     candidate list for review, with attribution kept) and the alternatives in `#1515`. Until then
     S1d delivers nothing that writes images.

## S1b addendum — department tree and price list (owner, 2026-11-11)

The owner asked for the ~37 top-level categories to become a few departments with sub-departments,
named consistently, and gave a price list (chicken, fresh meat, frozen meat, fish, prawns, seafood,
vegetables, fruit) that is the **main data**: it overrides an existing product of the same name.

R12. `prisma/manifests/aheed-taxonomy.json` declares 12 shopper departments plus two hidden groups
     (`Not Sold Online` for the restricted till departments, `Needs Review` for unsorted lines). Every
     name is Title Case (`isTitleCase`, tested against the file).
R13. `scripts/catalogue-taxonomy.ts` reuses an existing category by slug (rename, re-parent, re-order,
     keeping its images), creates a missing one inactive, moves products via `absorb`, and archives
     every category the tree does not name under an inactive `Archived` node. It refuses to archive a
     category that still holds products. Dry run default; `--confirm-host`; `--production`.
R14. `scripts/catalogue-load-price-list.ts` loads a price list kept outside the repository. A list item
     overrides an existing product whose name has the same word set (or one of its aliases);
     identically named till duplicates override the first and are reported; different names that
     both match are skipped as ambiguous. Override writes name, price and price label, department,
     brand and fresh/halal flags, keeping PLU, active flag and restriction.
R15. New products are created hidden with a default stock row. An item without a price is created at
     £0 and reported as "price needed"; S1e never activates a £0 line.
R16. "N for £X" offers become the product's `ProductPriceTier`; box offers are their own products;
     brands are upserted by slug; offer banners are `Promotion` rows linked to their department,
     created **inactive**.
R17. Verified on staging: the storefront shows the new department names; the loader overrides 13 and
     creates 134, with 7 multi-buy tiers, 7 box products and 4 inactive promotions; re-runs of both
     scripts change nothing.

## Out of scope

S1a (sample products, the two £0 lines), S1e (activation), stock tracking policy, age verification
at handover (`#1200` option 2), and any change to the importer itself.
