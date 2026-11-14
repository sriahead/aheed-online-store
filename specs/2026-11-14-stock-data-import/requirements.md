# Stock Data Import & Update Manager (requirements)

Issue #1570. Owner decisions 2026-11-14: a matched till product gets a **clean shopper name** (PLU,
barcode and history kept); a row listing two forms ("whole / powder", "black/white") is **split into
two products** at the same price. Nothing an import writes is live: the store reviews and switches
products on itself. Any store, not only Aheed.

## Input and store metadata

R1. Reads `.xlsx`, `.xls` and `.csv` through `scripts/lib/read-spreadsheet.ts` (the one module that
    imports the spreadsheet package). One or more files per run.
R2. A **store profile** (JSON, validated) holds everything store-specific, so no store's names live
    in code: column mapping (by header text or column letter, header row or none), section-heading
    rows → category, per-file defaults (brand, category), canonical brands with aliases, spelling
    fixes, synonyms used for matching, name template, which forms split, and attribute rules.
    `scripts/stock-import/profiles/_template.json` documents every key; a store's profile sits next
    to it. Client spreadsheets, review sheets and reports stay in gitignored `.import-reports/`.
R3. Optional columns, all honoured when mapped: PLU, barcode, brand, category, description, was
    price, multi-buy ("3 for £5"), bundle name and quantity, promotion headline, VAT rate, origin,
    dietary flags (halal, vegetarian, organic, gluten free, fresh), and any number of attribute
    columns.

## Plan (the dry run)

R4. Normalises every row: trims; skips blank rows; a row with a name but no price and no size is a
    **section heading**; brand from the brand column, else a leading brand word or alias in the name,
    else the file default; spelling fixes; title case; size to net content (`grm`, `gm`, `gms` read
    as grams); price to integer pence; splits a two-form row when both sides are profile form words.
R5. Flags, never guesses: missing or unreadable price, missing size, no brand, unknown category, a
    price over £1,000, an in-file duplicate (same brand, name and size; a second copy with a
    different price is a conflict).
R6. Matches each row against the store's catalogue: PLU, then barcode, then brand + name + size
    scored on normalised words with synonyms. A conflicting form (seeds vs leaves, whole vs powder)
    rules a candidate out. HIGH = unique best, same size: suggested UPDATE. MEDIUM (size unknown on
    the candidate, near tie, weaker score) or one product claimed by two rows: REVIEW. No candidate:
    CREATE.
R7. Writes a **review sheet** (xlsx) with one line per product: source file and row, clean name,
    brand, category, size, price, suggested decision, matched product (id, name, PLU, price),
    confidence, reason, and the field changes an UPDATE would make. A person edits the Decision and
    Target columns. Plan opens the database read-only.

## Apply

R8. Applies the reviewed sheet against the same source (a changed source is refused). REVIEW lines
    are skipped until a person decides.
R9. Master data first, reused before created: brands (by name, slug or alias), categories (an
    unknown one created **inactive**), attributes and options (by slug).
R10. UPDATE: a blank incoming field never overwrites; a field staff edited (`manuallyEditedFields`)
     is kept unless `--overwrite-edited`; the slug never changes; `isActive` and `restriction` are
     never touched; a **live** product's price changes only with `--update-live-prices`. Name,
     price, size (with unit price and unit label), brand and category follow the sheet.
R11. CREATE: hidden (`isActive=false`), inventory UNKNOWN with quantity 0, unique slug, tagged with
     the run's `importBatchId` and source row so the batch can be found and rolled back.
R12. Offers, all created **inactive**: was price → `originalPrice` (only when higher); multi-buy →
     `ProductPriceTier`; bundle → `Bundle` + `BundleItem`; promotion → `Promotion` on the product.
R13. Re-running the same reviewed sheet changes nothing.
R14. Guards: dry run by default; `--apply` needs `--confirm-host <db host>`; a production secrets
     file also needs `--production`.

## Report and skill

R15. Every run writes a report (markdown + JSON): created, updated, unchanged, skipped, duplicates,
     master data created, and every issue with its row — including what is still missing before the
     store can switch products on (no image, inactive category, no size).
R16. A Claude Code skill, **Stock Data Import & Update Manager** (`.claude/skills/stock-import/`),
     walks a session through it: analyse the files, write or extend the store's profile, plan,
     review the uncertain lines with the owner, apply to staging, verify, report.
R17. First run: Aheed's two files (spices; Shan) into **AFC staging**, verified by re-reading the
     database, and summarised to the owner.
