---
id: ui-polish-docs-integration-val
title: "UI Polish & Docs Integration Validation"
audience: [dev]
type: spec
status: approved
version: "1.1.0"
updated: 2026-08-23
visibility: internal
summary: "Re-run validation for the UI transition rules (compiled against Tailwind v4 directly) and the documentation integrations, replacing checks that had been ticked against reverted code."
tags: ["ui", "docs", "help-centre", "runbook", "validation"]
---

# UI Polish & Docs Integration (validation)

V1. [x] **UI Micro-Interactions:** Inspected `app/globals.css` — it declares **no** transition, `:active` or `cubic-bezier` rule; the file is 27 lines (`color-scheme`, `body` colours, `.no-scrollbar`). Grepped `app/`, `components/` and `features/` for `transition-all`: **zero** hits outside `docs/ui-ref/`, which is excluded from lint, typecheck and Prettier and is never built. Per-component transitions name their properties.

> **This V1 previously read the other way and was ticked `[x]` against code that no longer
> exists** — it asserted a global `200ms cubic-bezier` rule and a `button:active` scale in
> `app/globals.css`, both removed in `a9d886c` when they turned out to cause the layout thrashing
> (see R1). A `[x]` that survives the code it attests to is worse than an unchecked box, so the
> claim above is the re-run result, not the original.

V1a. [x] **No layout-affecting property is animated by a blanket utility.** Compiled Tailwind
v4.3.3 directly (`npx @tailwindcss/cli`) to read the emitted `.transition` rule rather than trusting
documentation: `transition-property: color, background-color, border-color, outline-color,
text-decoration-color, fill, stroke, --tw-gradient-*, opacity, box-shadow, transform, translate,
scale, rotate, filter, backdrop-filter, display, content-visibility, overlay, pointer-events`.
`width`/`height` are absent — confirming the sweep fixed the thrashing — and `translate`/`scale`/
`rotate` are **present**, confirming `ProductCard`'s hover-lift and `DepartmentScroller`'s
`group-hover:scale-110` still animate (v4 emits these as standalone properties, not `transform`, so
this was not safe to assume).

V1b. [x] **Carousel dot expand restored.** The sweep over-corrected one site: `PromoCarousel`'s
pagination dots animate `w-2` -> `w-4` on the active dot, and `transition` cannot animate `width`,
so the dot began snapping. Restored with an explicit `transition-[width,background-color]`, verified
to compile to `transition-property: width,background-color`. The dot row is `absolute bottom-3
left-1/2`, i.e. out of document flow, so this cannot reintroduce page-level thrashing.
V2. [x] **Staff Runbook Filtering:** Inspected `app/(admin)/staff/runbook/page.tsx`. A `.filter()` explicitly asserts that only documents containing `staff` or `store-admin` in their audience array are passed to the `RunbookClient`.
V3. [x] **Schema Update:** Inspected `kms/schema/frontmatter.ts`. The `Audience` z.enum contains `shopper`, `store-admin`, and `platform-admin`. The `trackFor` function correctly maps them to `customer-help`, `staff-ops`, and `internal-eng`.
V4. [x] **Shopper Help Guide Integration:** Inspected `app/(storefront)/help/page.tsx`. `DOC_ARTICLES` is imported, filtered for `shopper` or `customer`, and rendered using `<Markdown>` at the bottom of the page.
V5. [x] **CHANGELOG:** `CHANGELOG.md` includes an entry for this feature.
V6. [x] **KMS Validation:** `npm run kms:validate` ran and returned 0 failing documents. The index was successfully built with 93 artifacts.
