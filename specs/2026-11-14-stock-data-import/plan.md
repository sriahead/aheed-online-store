---
id: 2026-11-14-stock-data-import-plan
title: "Stock Data Import & Update Manager (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-14
visibility: internal
summary: "Pure library lib/stock-import (profile, normalise, match, merge, plan), one Node script scripts/stock-import.ts (plan → review xlsx → apply → report), store profiles under scripts/stock-import/profiles, and the stock-import skill."
tags: [catalogue, import, stock, skill]
related: [2026-11-14-stock-data-import-requirements]
---

# Stock Data Import & Update Manager (plan)

Issue #1570. Requirements: `requirements.md`.

## Why a new tool

`scripts/import-catalogue.ts` (#1216) requires a PLU and department columns and creates only;
`scripts/catalogue-apply-stock-list.ts` (#1523) updates existing products from a hand-written JSON.
A store's own price list has neither shape. The new tool reuses their parts: `parsePricePence`,
`extractDetailedNetContent`, `slugify`, `deriveUnitPricePenceForSort`, the spreadsheet reader and
the host guard pattern.

## Shape

- `lib/stock-import/` (pure, no database, no spreadsheet package; unit-tested)
  - `profile.ts` — zod schema for the store profile.
  - `normalise.ts` — grid → section-aware rows → normalised products (brand, clean name, size,
    price, splits, flags, offers, attributes, issues).
  - `match.ts` — catalogue entry type, word normalisation with synonyms, form conflicts, scoring,
    confidence.
  - `merge.ts` — field-level UPDATE changes (blank keeps, staff edits kept, live price guarded).
  - `plan.ts` — duplicates, one-target-per-product, decisions, review lines, report counts.
- `scripts/stock-import.ts` — CLI: `plan` reads the catalogue (read-only) and writes
  `review.xlsx` + `plan-report.md/json`; `apply` reads the review sheet and writes, one small
  transaction per product line, then `apply-report.md/json`.
- `scripts/stock-import/profiles/_template.json` and `aheed-food-centre.json`.
- `.claude/skills/stock-import/SKILL.md`.

## Decisions

- **Review first.** Spelling in store lists is not the catalogue's; a wrong merge overwrites a real
  product's price and name. Only HIGH matches are suggested as UPDATE, and the sheet is the record
  of what a person accepted.
- **Hidden always.** The tool has no code path that sets `isActive=true`.
- **Profiles in the repository, data outside it.** Brand aliases, category maps and spelling fixes
  are store configuration, not commercial data; prices and stock files are.
- **Writes through `PrismaNeon` (WebSocket) in Node**, like the other catalogue scripts, so
  `createMany` and per-line transactions are safe.
