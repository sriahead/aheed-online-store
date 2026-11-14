# Staff stock import (build notes)

Issue #1578. Built 2026-11-14 in worktree `E:\GitRepositories\aheed-wt-1558`, branch
`feature/stock-import-screen`.

## What was built

- Migration `20261114150000_staff_stock_import`: hand-authored (#895), the DDL is
  `prisma migrate diff --from-schema-datamodel <staging schema> --to-schema-datamodel` output,
  checked identical to the file after the header. Only new `StockImport*` types, tables, indexes and
  foreign keys. `prisma format` re-aligned the User/Vendor/Product/Category relation blocks
  (whitespace only).
- `lib/repositories/stock-import.ts` holds the store load, `ensureMasterData`, `applyLine`,
  `writeExtras` (moved from the CLI), settings read/write, runs, decisions, the chunked apply with
  claims, and undo. `scripts/stock-import.ts` now applies through `applyLine`.
- Presets moved to `lib/stock-import/presets/` (bundled for the Worker). Aheed's generic
  synonyms, form words, conflicting forms and "curry" moved into `general`/`spices`.
- The #1216 staff importer (`StockFileImporter`, its actions, types, service and test) was removed;
  `lib/catalogue-import/` stays for `scripts/import-catalogue.ts`.

## Checks

- Old vs new CLI plans on AFC staging today (read-only), all three owner lists: Laziza 18, Shan 44,
  spices 88 lines, **0 differences** in decision, name, target or changes.
- lint, typecheck, format, kms:validate, `npm run build` (routes listed), full vitest 459 files /
  6,731 tests green (`--maxWorkers=4`).
- Not run locally: `npm run preview` (the worktree's node_modules is a junction). The screen is
  verified on AFC staging after the staging deploy applies the migration.

## After the first staging deploy (fix branch `fix/1578-settings-brands-claim`)

- `settings-push` to AFC staging, then reading the settings back: brands with no other spellings
  (Heera, Shan, Laziza …) were missing, because only aliases had rows. Naming then let a longer store
  brand ("LAZIZA ACHAR GOSHT") outrank Laziza. Each listed brand now stores a row for its own name;
  the read hides it.
- `to-screen` showed row 7 "Chicken Masala" taking "Laziza Chicken Tikka Masala" (0.83) from row 9,
  which names it exactly (1.00): the first row claimed the product. The CLI did the same (an
  existing matcher gap). The best-scoring row now keeps a product. Dry run of all three lists: only
  rows 7 and 9 of Laziza change.
