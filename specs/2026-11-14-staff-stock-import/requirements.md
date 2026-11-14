# Staff stock import: upload, review and apply price lists in the staff panel (requirements)

Issue #1578, follows #1570 and #1573. Owner request and approval 2026-11-14 ("one piece").

## Requirements

- **R1 — Settings per store, in the database.** Columns (by letter or header text), header row,
  default category, presets (general, spices, rice, fish), naming switches, brand spellings, spelling
  fixes, synonyms, file rules, section and category-column text, ignore/noise/preserve words.
  Relational tables, no Json columns. A store admin edits them on a settings screen.
- **R2 — First-time setup.** With no settings, uploading a file shows its first rows and asks which
  column is the name (required), size, price, PLU, barcode, brand, category; plus header row, default
  category and presets. Saved as the store's settings.
- **R3 — Plan on upload.** The server normalises, names and matches every row with the same code as
  the CLI (`lib/stock-import/`) and stores the run: the file's cells, one line per row with the
  suggestion (Update, Create, Review, Skip, Duplicate), reason, clean name, size, price, matched
  product, runner-up and other sizes. Nothing is written to products. Row cap per upload.
- **R4 — Review screen.** Lines grouped: Needs a decision (Review and Held), New, Update, Unchanged,
  Skipped/duplicates, Applied, Failed. Each shows the till's current name, PLU, price, size and
  whether it is live. Staff choose Update (a suggested product or any product found by name/PLU),
  Create or Skip, with a note. A held line shows its question.
- **R5 — Apply.** Applies decided Update/Create lines not yet applied, one transaction per line, in
  chunks the browser drives with progress. Created products are hidden with stock UNKNOWN and the
  store's low-stock default; nothing becomes live; a live product's price is not changed; staff-edited
  fields and blank cells are kept (#1570 rules). A line is applied at most once (claimed before
  writing). Undecided lines stay open; the run can be resumed and applied again later.
- **R6 — Re-run safety.** A Create whose product already exists by that exact name updates it
  instead; re-uploading the same file after applying creates nothing.
- **R7 — Settings change guard.** Apply refuses when the settings changed since the plan; "Refresh
  plan" re-plans from the stored cells and keeps decisions by row.
- **R8 — Undo.** "Undo this import" deletes products the run created that nobody has edited,
  stocked, ordered, reviewed or favourited, and restores each field the run changed when it still
  holds the run's value. Anything kept is listed with the reason.
- **R9 — One import page.** `/staff/products/import` becomes the new importer; the #1216 staff
  importer (page component and actions) is retired. Store admins only.
- **R10 — One apply path.** The CLI (`scripts/stock-import.ts`) applies through the same library
  code; it can push a JSON profile into a store's settings and move a CLI run's held lines onto the
  screen. The skill says when to use which.
- **R11 — Laziza.** Aheed's profile is pushed to AFC staging and the 10 held Laziza lines appear on
  the screen with their questions, for the owner to decide.

## Out of scope

AI suggestions; images; dietary flag and attribute columns on the settings screen (the CLI profile
keeps them); production rollout without the owner's approval.
