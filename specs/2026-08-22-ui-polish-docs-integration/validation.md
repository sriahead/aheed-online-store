---
id: ui-polish-docs-integration-val
title: "UI Polish & Docs Integration Validation"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-22
visibility: internal
summary: "Validation steps for ensuring the global UI animations and documentation integrations behave exactly as specified."
tags: ["ui", "docs", "help-centre", "runbook", "validation"]
---

# UI Polish & Docs Integration (validation)

V1. [x] **UI Micro-Interactions:** Inspected `app/globals.css`. A global transition rule applies `200ms cubic-bezier` to interactive elements (`a`, `button`, `input`). A `transform: scale(0.98)` rule applies to `button:active`.
V2. [x] **Staff Runbook Filtering:** Inspected `app/(admin)/staff/runbook/page.tsx`. A `.filter()` explicitly asserts that only documents containing `staff` or `store-admin` in their audience array are passed to the `RunbookClient`.
V3. [x] **Schema Update:** Inspected `kms/schema/frontmatter.ts`. The `Audience` z.enum contains `shopper`, `store-admin`, and `platform-admin`. The `trackFor` function correctly maps them to `customer-help`, `staff-ops`, and `internal-eng`.
V4. [x] **Shopper Help Guide Integration:** Inspected `app/(storefront)/help/page.tsx`. `DOC_ARTICLES` is imported, filtered for `shopper` or `customer`, and rendered using `<Markdown>` at the bottom of the page.
V5. [x] **CHANGELOG:** `CHANGELOG.md` includes an entry for this feature.
V6. [x] **KMS Validation:** `npm run kms:validate` ran and returned 0 failing documents. The index was successfully built with 93 artifacts.
