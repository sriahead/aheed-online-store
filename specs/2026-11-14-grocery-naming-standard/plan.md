---
id: 2026-11-14-grocery-naming-standard-plan
title: "Grocery naming standard and category-specific attributes (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-14
visibility: internal
summary: "Extends the stock import (#1570) with per-category word order and templates, till-word preservation, presets (general, spices, rice, fish) with category-scoped filters, and a possible-duplicates report; re-runs the AFC staging lists."
tags: [catalogue, import, naming, attributes, skill]
related: [2026-11-14-grocery-naming-standard-requirements, 2026-11-14-stock-data-import-plan]
---

# Grocery naming standard and category-specific attributes (plan)

Issue #1573. Requirements: `requirements.md`.

## Shape

- `lib/stock-import/profile.ts` — `presets`, `wordOrder`, `categoryRules`, `keepTillWords`,
  `noiseWords`, `derivedAttributes[].categories`; `stockImportPresetSchema`, `applyPresets`,
  `inCategory`.
- `lib/stock-import/normalise.ts` — `namingFor` (category rule), `orderWords`, ml normalisation,
  category-scoped `deriveAttributes`.
- `lib/stock-import/naming.ts` (new) — `tillCore`, `withTillWords`.
- `lib/stock-import/plan.ts` — till words on UPDATE lines (`tillWords`, `listRow`),
  `catalogueDuplicates`.
- `scripts/stock-import.ts` — loads presets beside the profile, `--previous-run`, hashes presets and
  the previous run into the Run sheet, report sections, a "Till words kept" column; apply falls back
  to the list's name when a reviewer chose another product.
- `scripts/stock-import/presets/*.json`; the Aheed profile uses all four.
- Skill: naming standard, presets, re-run guidance.
