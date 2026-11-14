---
id: 2026-11-14-staff-stock-import-plan
title: "Staff stock import: upload, review and apply price lists (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-14
visibility: internal
summary: "Moves the stock import (#1570, #1573) into the staff panel: per-store settings in relational tables, first-time column setup, stored runs with a review screen, chunked apply with one transaction per line, undo, and a shared apply library for the CLI."
tags: [catalogue, import, staff, schema]
related: [2026-11-14-stock-data-import-plan, 2026-11-14-grocery-naming-standard-plan]
---

# Staff stock import (plan)

Issue #1578. Requirements: `requirements.md`.

## Data (migration `20261114150000_staff_stock_import`, hand-authored per #895)

- Settings: `StockImportSettings` (one per vendor: columns, header row, default category, naming
  switches, `updatedAt` as the version), `StockImportSettingsPreset`, `StockImportBrandAlias`
  (→ `Brand`), `StockImportSpelling`, `StockImportSynonymGroup` + `StockImportSynonymWord`,
  `StockImportWord` (IGNORE / NOISE / PRESERVE), `StockImportCategoryText` (SECTION / COLUMN →
  `Category`), `StockImportFileRule`.
- Runs: `StockImportRun` (file name and hash, settings version, batch id, status OPEN/UNDONE),
  `StockImportCell` (the uploaded grid), `StockImportLine` (plan + decision + result),
  `StockImportFieldChange` (previous and new value per field, for undo).

## Code

- `lib/stock-import/presets/*.json` (moved from `scripts/`; generic form words, conflicting forms,
  spice synonyms and "curry" move from Aheed's profile into the spices preset).
- `lib/stock-import/settings.ts` (pure): settings ⇄ profile, text-list parse/format for the screen.
- `lib/stock-import/field-change.ts` (pure): encode/decode a field's value; undo decision.
- `lib/repositories/stock-import.ts`: load store, plan a run, record decisions, claim and apply
  lines (`applyLine` shared with the CLI), undo, settings read/write, product search.
- `lib/stock-import-service.ts`: request-scoped facade.
- `features/admin/stock-import.ts`: server actions (ADMIN).
- Pages: `/staff/products/import` (upload, setup, runs), `/staff/products/import/[runId]`
  (review/apply/undo), `/staff/products/import/settings`.
- `scripts/stock-import.ts`: apply via `applyLine`; `settings-push`, `to-screen` commands.

## Decisions

- **Re-normalise at apply, don't re-match.** Apply re-reads the stored cells with the settings the
  plan used (guarded by version) and uses the reviewed target; matching runs only at plan time, so
  apply chunks stay cheap on a Worker.
- **Claim before write.** `updateMany` OPEN→APPLYING per chunk (WebSocket client), so two tabs
  cannot apply a line twice.
- **Undo compares before restoring.** A field is restored only while it still holds the run's value.
