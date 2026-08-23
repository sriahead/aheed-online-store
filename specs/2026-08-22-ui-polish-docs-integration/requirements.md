---
id: ui-polish-docs-integration-req
title: "UI Polish & Docs Integration Requirements"
audience: [dev]
type: spec
status: approved
version: "1.1.0"
updated: 2026-08-23
visibility: internal
summary: "Requirements for smooth interactive-state transitions that never animate layout, strict Staff Runbook audience filtering, and surfacing the Shopper Guide in the Help Centre."
tags: ["ui", "docs", "help-centre", "runbook"]
---

# UI Polish & Docs Integration (requirements)

This slice addresses minor UI polish feedback and integrates the newly created role-based documentation into the application UI.

R1. **UI Micro-Interactions:** Hover, focus and active states on interactive elements must change smoothly, **without animating any property that participates in page layout**. Transitions are declared **per component** as Tailwind utilities that name their properties (`transition`, `transition-colors`, or an explicit `transition-[...]` list) — never `transition-all`, and never as a global element-selector rule in `app/globals.css`.

> **R1 was rewritten after the fact; the original text is preserved here because it is the reason
> three follow-up PRs exist.** As first written, R1 mandated the opposite: a *global* CSS rule
> applying a `200ms cubic-bezier` transition to `button, a, input, select, textarea` plus a global
> `button:active { transform: scale(0.98) }`. That shipped in `d25e32d`, and it was the direct cause
> of the layout thrashing on page refresh that PR #323 and PR #324 then spent four commits chasing:
> a global transition (and, equally, Tailwind's `transition-all`) animates `width`/`height`, so every
> component that settles its own dimensions after mount visibly animated into place. The global rule
> was removed in `a9d886c`; `89c999e` swept the remaining `transition-all` utilities to `transition`.
> **The requirement now states the rule that actually holds.**
R2. **Staff Runbook Filtering:** The Staff Runbook (`app/(admin)/staff/runbook/page.tsx`) must be updated to strictly filter the rendered `DOC_ARTICLES` array so that only articles with `staff` or `store-admin` audiences are visible. Platform-admin documentation must not leak into the store-admin view.
R3. **Schema Update:** The KMS Frontmatter schema (`kms/schema/frontmatter.ts`) must be updated to support the new role-based audiences (`shopper`, `store-admin`, `platform-admin`, etc.) and correctly map them to the existing tracks.
R4. **Shopper Help Guide Integration:** The public `/help` page must dynamically read the `shopping-guide.md` from the KMS index (via `DOC_ARTICLES`) and render it using `react-markdown` below the static FAQ sections.
R5. `CHANGELOG.md` updated (Gate 4).
R6. `npm run kms:validate` and `npm run kms:build-index` must execute successfully, ensuring no broken frontmatter in the documentation.
