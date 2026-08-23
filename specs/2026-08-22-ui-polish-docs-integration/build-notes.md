---
id: ui-polish-docs-integration-build
title: "UI Polish & Docs Integration Build Notes"
audience: [dev]
type: spec
status: approved
version: "1.1.0"
updated: 2026-08-23
visibility: internal
summary: "Why the global CSS transition was reverted, how the transition-all sweep over-corrected the carousel dots, and the resolution of the KMS indexing bug for new audiences."
tags: ["ui", "docs", "help-centre", "runbook", "build-notes"]
---

# UI Polish & Docs Integration (build notes)

- **UI Animations — the base-layer override was tried, and it was the wrong call.** The build first
  did the tempting thing: rather than patch every component, a base-layer rule in `app/globals.css`
  targeted all semantic interactive elements and assigned a transition (later a "hardware-accelerated"
  variant, `726b6f0`, trying to fix the symptom). That is what caused the layout thrashing on refresh
  — a global transition animates `width`/`height` too, so any component that settles its own
  dimensions after mount animated into place, on every page load. Removed in `a9d886c`; the residual
  `transition-all` utilities were swept to `transition` in `89c999e` (PR #324).
  **The generalisation worth keeping: a transition declared where it cannot see which properties will
  change must not be allowed to animate `all`.** A global selector and `transition-all` are the same
  mistake at different scopes.
- **The sweep then over-corrected, and nothing caught it.** Tailwind v4's `transition` omits `width`,
  so `PromoCarousel`'s active pagination dot (`w-2` -> `w-4`) stopped animating and began snapping.
  `lint`, `typecheck`, `test` and `build` all stayed green — no check in this repo asserts that an
  intended animation still runs, and the dot is 2px of movement inside an overlay, which is exactly
  the size of defect a human skim does not catch either. Fixed with an explicit
  `transition-[width,background-color]`; safe because that row is `absolute`, so its width is not in
  page flow. **When replacing a blanket transition, the per-site question is "which property was this
  actually animating?" — the sweep answered it correctly at eight of nine sites.**
- **KMS Schema Bug:** While attempting to surface the `shopping-guide.md`, it was discovered that `kms:build-index.ts` silently ignores files with invalid Zod frontmatter. Because the previous documentation restructuring introduced new audiences (`shopper`, `store-admin`, etc.) that were not in the Zod schema, the KMS index entirely dropped 7 markdown files.
- **KMS Schema Resolution:** `kms/schema/frontmatter.ts` was updated to expand the `Audience` and `DocType` enums. The `trackFor` derivation function was also updated so that `store-admin` maps to `staff-ops` and `shopper` maps to `customer-help`.
- **Help Centre Rendering:** The `HelpPage` (`app/(storefront)/help/page.tsx`) was upgraded to a Server Component that queries the local `docs.ts` index, finds the shopper guide, and renders it safely via `react-markdown`.
