# Stock Data Import & Update Manager (build notes)

Issue #1570. Built 2026-11-14 in the worktree `E:\GitRepositories\aheed-wt-1558` (branch
`feature/1570-stock-import`, from `origin/staging` at `94b9afb7`).

## What changed

- `lib/stock-import/`: `profile.ts`, `normalise.ts`, `match.ts`, `merge.ts`, `plan.ts` (pure).
- `scripts/stock-import.ts`: `plan`, `decide`, `apply` (with read-back and report).
- `scripts/lib/read-spreadsheet.ts`: `readWorkbookSheets`, `writeWorkbook` (kept in the one file
  allowed to import the spreadsheet package; `tests/catalogue-import-guards.test.ts`).
- `scripts/stock-import/profiles/_template.json`, `aheed-food-centre.json`.
- `.claude/skills/stock-import/SKILL.md`.
- `tests/stock-import.test.ts` (20 tests).

## Decisions found while building

- **A till brand is not a brand.** The till export left brands such as "SHAN KARAHI" and
  "SHAN BUTTER CHICKEN"; longest-spelling-first let them beat "Shan", so those products never
  matched. Profile brands now always come before the store's own brand names.
- **The one-letter typo rule needs the same first letter**: "Bihari Kebab" matched "Nihari".
- **`unitLabel` is a price fallback, not a size** (`ProductCard`: shown only without net content).
  The till import wrote prices there; the first apply wrote sizes ("100g"). It is now the price
  text, kept in step with the price, and a per-unit label ("£6.49 / kg") is never replaced. The
  second apply corrected the 124 first-run labels.
- **A size the catalogue contradicts is a question, not a new product.** Shan's list gives 50g for
  every mix, but four exist at 60g/100g; those rows are SKIPPED with the question, so no duplicates.
- **`decide` command**: a reviewer (Claude or a person) records decisions from JSON with a note per
  line; the note reaches the apply report.

## First run — AFC staging (R17)

Database `ep-super-cherry-zaeyqtsy…` (AFC staging). Files: spices list (82 rows) and Shan list
(44 rows) → 132 product lines after splits.

- Plan: 41 UPDATE, 49 CREATE, 40 REVIEW, 2 DUPLICATE. Reviewed (`decisions.json`): 19 UPDATE,
  19 CREATE, 6 SKIP.
- Apply `stock-import-202611140043`: **62 created** (hidden, stock UNKNOWN), **62 updated**, 8 skipped
  (2 duplicates, 6 questions), 0 failed; master data: attribute Form + 6 options. No brand or category
  needed creating.
- Re-apply: 0 created, 124 unit labels corrected; third apply: **0 created, 0 updated, 124 unchanged**.
- Independent read-back: 62 batch products, 0 active, all `UNKNOWN/0`; store still 73 live products;
  "Spices & Masalas" is switched off; 124 products without an image.

Reports: `.import-reports/stock-import/aheed-run1/` (gitignored).
