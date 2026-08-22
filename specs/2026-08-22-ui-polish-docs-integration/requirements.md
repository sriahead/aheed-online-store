---
id: ui-polish-docs-integration-req
title: "UI Polish & Docs Integration Requirements"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-22
visibility: internal
summary: "Requirements for adding global micro-interactions to the UI, strictly filtering the Staff Runbook, and surfacing the Shopper Guide in the Help Centre."
tags: ["ui", "docs", "help-centre", "runbook"]
---

# UI Polish & Docs Integration (requirements)

This slice addresses minor UI polish feedback and integrates the newly created role-based documentation into the application UI.

R1. **UI Micro-Interactions:** A global CSS transition must be applied to all interactive elements (`button`, `a`, `input`, `select`, `textarea`) to ensure hover and focus states change smoothly (e.g. 200ms cubic-bezier). Furthermore, an active state scale-down effect (`scale(0.98)`) should be globally applied to buttons.
R2. **Staff Runbook Filtering:** The Staff Runbook (`app/(admin)/staff/runbook/page.tsx`) must be updated to strictly filter the rendered `DOC_ARTICLES` array so that only articles with `staff` or `store-admin` audiences are visible. Platform-admin documentation must not leak into the store-admin view.
R3. **Schema Update:** The KMS Frontmatter schema (`kms/schema/frontmatter.ts`) must be updated to support the new role-based audiences (`shopper`, `store-admin`, `platform-admin`, etc.) and correctly map them to the existing tracks.
R4. **Shopper Help Guide Integration:** The public `/help` page must dynamically read the `shopping-guide.md` from the KMS index (via `DOC_ARTICLES`) and render it using `react-markdown` below the static FAQ sections.
R5. `CHANGELOG.md` updated (Gate 4).
R6. `npm run kms:validate` and `npm run kms:build-index` must execute successfully, ensuring no broken frontmatter in the documentation.
