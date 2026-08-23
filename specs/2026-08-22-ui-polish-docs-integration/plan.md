---
id: ui-polish-docs-integration
title: "UI Polish & Docs Integration (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-22
visibility: internal
summary: Smooth interactive-state transitions without animating layout, strict Staff Runbook audience filtering, and the Shopper Guide surfaced in the Help Centre.
tags: [ui, docs, help-centre, runbook, p8]
---

# UI Polish & Docs Integration (plan)

**Goal:** Land the minor UI-polish feedback from the P8.1 Help Centre slice, and connect the newly
role-based `docs/` tree to the two surfaces that are supposed to render it — the Staff Runbook and
the public Help Centre.

> **This plan was reconstructed after the slice shipped.** `specs/` for this slice were generated in
> `fac8e12`, *after* the implementation in `d25e32d`, and `plan.md` was the one required file that
> never got written — which is also why the slice never reached `ARTIFACT_INDEX.md`, since the KMS
> index keys artifacts on `specs/<slice>/plan.md`. It is written from the commits and the surviving
> spec files, so it records what was actually done rather than what was foreseen. It is not evidence
> that Gate 2 was honoured here; it was not. See "How this slice diverged from the loop" below.

**Scope (this slice):**

- **Interactive-state polish.** Hover/focus/active states on interactive elements should settle
  smoothly. The binding constraint — learned during the slice, not before it — is that **no
  transition may animate a property that participates in page layout**. Transitions are declared per
  component with named properties; `transition-all` and global element-selector transition rules are
  both out.
- **Staff Runbook audience filtering.** `app/(admin)/staff/runbook/page.tsx` filters `DOC_ARTICLES`
  to `staff` and `store-admin` audiences only, so platform-admin material cannot leak into a store
  admin's view.
- **KMS frontmatter schema.** `kms/schema/frontmatter.ts` gains the role-based audiences
  (`shopper`, `store-admin`, `platform-admin`, …) and maps them onto the existing tracks via
  `trackFor`.
- **Shopper Guide in the Help Centre.** `/help` reads `shopping-guide.md` through the generated
  `DOC_ARTICLES` index and renders it with `react-markdown` beneath the static FAQ sections.

**Deliberately excluded:**

- Any change to the docs' *content* — this slice wires up the role-based tree produced by `53a952d`
  and `533f0da`; it does not rewrite it.
- Dark mode. The storefront is light-only (`color-scheme: light`), and nothing here changes that.
- A `prefers-reduced-motion` policy beyond what `PromoCarousel` already implements for WCAG SC
  2.2.2. Worth its own slice; see below.

**Risks / things that bit:**

- **A global transition rule is not a shortcut for per-component transitions.** It animates
  `width`/`height` as well, so every component that settles its dimensions after mount animates into
  place on every page load. This is what happened, and it cost PR #323 and PR #324 to undo.
- **The KMS index fails silently.** `kms/scripts/build-index.ts` drops any file whose frontmatter
  fails Zod validation without erroring, so the docs restructure's new audience values silently
  removed 7 markdown files from the index. Any schema change here needs `npm run kms:validate`
  *and* a count check on the built index, not just a green exit code.

**How this slice diverged from the loop (recorded, not excused):**

- Gate 2 (spec before code) was inverted — implementation `d25e32d` preceded specs `fac8e12`.
- Gate 3's `validation.md` was ticked against the global-CSS implementation that was subsequently
  reverted, so it attested to code that no longer existed.
- `plan.md` was absent, which suppressed the `ARTIFACT_INDEX.md` entry and left
  `npm run sdd:audit` reporting the slice as undocumented.

**Open items carried forward:**

- No repo-wide `prefers-reduced-motion` handling. `PromoCarousel` pauses rotation correctly, but
  `AddToCartButton`'s `animate-spin` and the hover `scale`/`translate` micro-interactions on
  `ProductCard` and `DepartmentScroller` are unconditional. Needs its own proposal.
- `specs/2026-08-21-view-switcher/` is missing `build-notes.md` and `validation.md`;
  `specs/2026-08-21-p8-storefront-branding-webp/` is missing `build-notes.md`. Not reconstructable
  here without fabricating validation records.
