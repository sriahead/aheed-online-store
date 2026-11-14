---
name: stock-import
description: Stock Data Import & Update Manager. Use when a store sends a stock or price spreadsheet (.xlsx, .xls, .csv) to load or refresh products, brands, categories, attributes or offers (was price, multi-buy, bundles, promotions) for any vendor, or asks to standardise product names and filters. It analyses the file, extends the store's profile and presets, plans against the live catalogue, has uncertain matches reviewed, applies to staging with everything hidden, verifies and reports.
---

# Stock Data Import & Update Manager (#1570, #1573)

One reviewed path for every store's spreadsheet. Code: `scripts/stock-import.ts` (CLI) over
`lib/stock-import/` (pure, tested in `tests/stock-import.test.ts` and
`tests/stock-import-naming.test.ts`). Store settings: `scripts/stock-import/profiles/<vendor-slug>.json`;
shared rule sets: `scripts/stock-import/presets/` (`general`, `spices`, `rice`, `fish`). Specs:
`specs/2026-11-14-stock-data-import/`, `specs/2026-11-14-grocery-naming-standard/`.

## Never

- **Never make anything live.** Created products are hidden with stock UNKNOWN; created categories,
  price tiers, bundles and promotions are inactive. The store reviews and switches on in
  `/staff/products`. A live product's price changes only with `--update-live-prices`, and only when
  the owner asked for it.
- **Never guess a match.** Only HIGH (unique, same brand, same size, strong name) is suggested as
  UPDATE. Anything uncertain is REVIEW until a person decides.
- **Never commit client data.** Spreadsheets, review sheets and reports live in `.import-reports/`
  (gitignored). Profiles are configuration and are committed.
- **Never apply to production without the owner's explicit yes**, and never in the same step as
  staging: staging first, owner checks it, then production (`--production`). Production DB commands
  go to the user as a `! <command>` when auto mode blocks them.
- **Never overwrite** a field staff edited by hand (`manuallyEditedFields`) unless the owner asks
  (`--overwrite-edited`), an existing PLU, or a value the sheet leaves blank. Stock, VAT and barcodes
  change only when the sheet has that column.
- **Never invent a product detail.** A name may only reorder words and keep words the till already
  had; a filter value only comes from a word in the name or a column; dietary labels (halal,
  vegetarian, vegan, gluten free, organic) only from a column the store filled in.
- **Never merge** products of a different brand, variant, form or size. Possible duplicates are
  listed in the report for a person.

## Naming standard (#1573)

Every clean name is `{brand} {name} – {size}` unless a category rule says otherwise:

- **Title Case**, brand written as the store writes it (`brands[].name`, `preserveWords`: TRS, BBQ).
- **Sizes** as `g`, `kg`, `ml`, `L` (`100grm`, `1 Kilo`, `250 mls`, `2 Litres` are normalised).
- **Word order by category** (`categoryRules[].wordOrder`): heat and colour first, form last for
  spices (`TRS Extra Hot Chilli Powder – 100g`, `TRS Black Sesame Seeds`, `TRS Cloves Whole`); grain
  length first and "Rice" last for rice (`Extra Long Basmati Rice`); Fresh/Frozen last for fish
  (`Rohu Steaks Frozen`). Words are moved, never added or removed.
- **Till words kept** (`keepTillWords`): when the till name has every word of the list's name plus
  more, its wording is used (`Black Seeds` → `Black Onion Seeds`, `Dalchini` → `Cinnamon Sticks`,
  `Keema` → `Keema Curry Mix`). Only on a confident (UPDATE) match. `noiseWords` (`pkt`, `new`) never
  count. If an earlier run already replaced the till names, pass its plan as `--previous-run`.
- **Filters by category** (`derivedAttributes[].categories`, slug substrings): Spices → Form; Rice →
  Variety, Grain; Fish → Species, Storage (Fresh/Frozen), Cut, Grade; snacks, sauces, pickles,
  drinks, biscuits, noodles → Flavour. Existing filters and options are reused; new ones created.
- A name staff corrected by hand is never replaced.

## Steps

1. **Analyse the files.** Read every row (`readSourceGrid` in `scripts/lib/read-spreadsheet.ts`, or a
   throwaway script in `.import-reports/`). Note: header row or none; which column is name, size,
   price, PLU, barcode, brand, category; section-heading rows; brand written in the name; typos and
   till abbreviations; "x / y" rows naming two forms; in-file duplicates; offers (was price,
   "3 for £5", bundle or promotion columns); anything a column does not say (never fill it in).
2. **Read the catalogue, read-only.** Secrets file and URL key from `docs/developer-portal/env-setup.md`
   (`secrets/afc-staging.vars` → `AFC_DIRECT_URL` for an AFC cell; `secrets/staging.vars` →
   `DIRECT_URL` for the shared staging). Check the brands and categories that exist and how the
   store's existing products are named, so the profile reuses them.
3. **Write or extend the profile.** Copy `_template.json` for a new store and list the presets that
   fit what it sells (`presets`: `general` always; `spices`, `rice`, `fish` as needed). A preset is
   merged under the profile and the profile's own values win; add a preset for a new kind of product
   rather than putting shared rules in one store's profile. Keys:
   - `headerRow` `auto` (columns by header text) or `none` (columns by letter A, B, C).
   - `columns`: `name` (required), `size`, `price`, `plu`, `barcode`, `brand`, `category`,
     `description`, `wasPrice`, `multiBuy`, `bundle`, `bundleQuantity`, `promotion`, `vat`, `origin`,
     `flags` (`isHalal`, `isVegetarian`, `isOrganic`, `isGlutenFree`, `isFresh` → column),
     `attributes` (attribute name → column).
   - `defaultCategory`, `sectionCategories` (heading text → slug), `categoryMap` (category column text
     → slug; unmapped text creates an inactive category), `files` (file-name regex → default brand and
     category).
   - `brands` (canonical name + aliases), `spelling` (whole-word fixes), `synonyms` (match-only
     equivalents such as jeera = cumin), `ignoreWords`, `formWords` (which "x / y" rows split),
     `conflictingForms` (seeds vs leaves, hot vs mild: never the same product), `preserveWords`.
   - `nameTemplate` (`{brand} {name} – {size}`), `wordOrder` (`leading`, `trailing`),
     `categoryRules` (`categories` slug substrings → `nameTemplate` and/or `wordOrder`),
     `keepTillWords`, `noiseWords`, `renameMatched`, `moveMatchedToCategory`, `derivedAttributes`
     (an attribute filled from words in the name, optionally only in `categories`).
   Ask the owner only real forks (rename matched products? split two-form rows?) and record the
   answers in the profile's `notes`.
4. **Plan** (read-only; writes `review.xlsx`, `plan-report.md`, `plan.json`):

   ```bash
   npx tsx scripts/stock-import.ts plan <file> [<file> …] --profile scripts/stock-import/profiles/<slug>.json \
     --secrets secrets/<env>.vars --url-key <KEY> --out .import-reports/stock-import/<slug>-<date>
   ```

   Read every line, the **Till words kept** and **Possible duplicates already in the catalogue**
   sections of `plan-report.md`, and the "Till words kept" column. A wrong suggestion usually means a
   profile gap (a spelling, a synonym, a conflicting form, a brand alias, a word-order rule): fix the
   profile or preset and plan again rather than overriding by hand.

   **Re-running a list after an earlier run.** Carry over only the earlier decisions for lines that
   are still REVIEW or CREATE: a line that now matches its own earlier-created product as UPDATE must
   not get the old CREATE back (its name may have changed, so the re-run guard would not see it and a
   duplicate would be created). Point an old CREATE at the product it created (UPDATE + its id).
5. **Review the uncertain lines.** For each REVIEW line decide UPDATE (with the product), CREATE or
   SKIP. Rule: UPDATE only when sure it is the same product and size; CREATE (hidden) when unsure,
   noting the possible duplicate; SKIP when the row itself is ambiguous ("Rajah Seasoning" — which?)
   or contradicts the catalogue (a size that differs from the existing pack). Put the decisions in a
   JSON file and record them:

   ```bash
   npx tsx scripts/stock-import.ts decide <decisions.json> --review <dir>/review.xlsx
   # { "<key>": { "decision": "UPDATE", "plu": "3422", "note": "methi = fenugreek" }, … }
   ```

   The owner can instead edit the Decision and Target product id columns in `review.xlsx`.
6. **Apply to staging** (needs the exact database host; refuses if a source file, the profile, a
   preset or the `--previous-run` file changed since the plan; pass the same `--previous-run`):

   ```bash
   npx tsx scripts/stock-import.ts apply <same files> --profile <p> --secrets secrets/<env>.vars \
     --url-key <KEY> --review <dir>/review.xlsx --confirm-host <host printed by plan>
   ```

   Master data is created first and reused (brands, categories, attributes and options); then each
   line in its own transaction. Created products carry `importBatchId` `stock-import-<timestamp>`.
7. **Verify.** The apply report has a read-back (created hidden, stock UNKNOWN, live products
   untouched, images missing). Apply the same sheet a second time: it must report 0 created and
   0 updated. Spot-check a few products in `/staff/products` on staging.
8. **Report to the owner**, concisely: created, updated, unchanged, duplicates, skipped with the
   question for each, possible duplicates in the catalogue, and what is still needed before going
   live (images, switched-off categories, the review in `/staff/products`). Commit profile changes.

## Optional data

All created inactive, all reused when they exist: `wasPrice` → `originalPrice` (only above the
price); `multiBuy` ("3 for £5") → `ProductPriceTier`; `bundle` (+ `bundleQuantity`) → `Bundle` and
`BundleItem`; `promotion` → `Promotion` linked to the product; `vat` (0, 5 or 20); `origin`;
dietary `flags`; `attributes` and `derivedAttributes` → `VendorAttribute` options and product values.
Images are not imported: use `scripts/fill-product-images.ts` or the staff image tools afterwards.

## Undo

Created products are tagged by batch (`importBatchId`); updates are listed field by field (old →
new) in `apply.json`. `scripts/rollback-import-batch.ts --batch-id <id> --vendor-id <id>` (dry run
first, then `--apply`) deletes created products nobody has edited, stocked or ordered; their
attribute values and price tiers go with them, but a product placed in a bundle must have its bundle
item removed first. Restore updated fields from `apply.json` if a whole run must be reversed.
