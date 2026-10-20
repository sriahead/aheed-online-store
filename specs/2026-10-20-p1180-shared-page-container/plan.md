---
id: p1180-shared-page-container-plan
title: "Shared page container and a three-step width scale (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-20
visibility: internal
summary: One PageContainer component with wide/standard/narrow widths and identical gutters, applied to all 60 pages, so content stops disagreeing with the chrome above it.
tags: [layout, design-system, staff-panel, storefront]
# related: [app-conventions, design-system]
---

# Shared page container and a three-step width scale (plan)

**Goal:** make every page's horizontal geometry come from one place, so the header, the admin nav
and the page body share a left edge and a gutter instead of each picking a width independently.
Shipping this removes the visible step between the `max-w-7xl` chrome and the `max-w-5xl` admin
hub, and gives the admin's tables the width they were always missing.

## Why this exists

There is no shared page container anywhere in the app, and that is deliberate — `app/layout.tsx:41`
says so:

> No width/padding constraint here — the storefront layout owns the header and each page owns its
> own width container.

Neither route-group layout adds one either. `app/(admin)/layout.tsx:46` and
`components/layout/StorefrontChrome.tsx:55` both render a bare `<div className="flex-1">{children}</div>`.
So sixty pages each choose a width alone, while the chrome above them does not:

| Element | Width |
|---|---|
| `Header.tsx:173` trust banner | `max-w-7xl mx-auto px-4` |
| `Header.tsx:229` main header row | `max-w-7xl mx-auto px-4` |
| `Header.tsx:363` below-`xl` search row | `max-w-7xl mx-auto px-4` |
| `PanelNav.tsx:119` admin tab strip | `max-w-7xl mx-auto px-4` |
| `app/(admin)/staff/page.tsx:63` the hub under it | **`max-w-5xl`** |

Content widths actually in use: `2xl`/`3xl`/`5xl`/`7xl` across 32 admin pages, and
`sm`/`xl`/`2xl`/`3xl`/`4xl`/`5xl`/`7xl` across 28 storefront pages.

**The admin half of the misalignment is four commits old and self-inflicted.** `#1177` widened
`PanelNav` from `max-w-5xl` to `max-w-7xl` so the grouped tab strip would stop wrapping, and
`PanelNav.tsx:106` documents the resulting mismatch as intentional — "chrome spanning wider than
its content column is a normal admin-panel pattern". That reasoning is defensible in the abstract
and wrong on screen: at any viewport above 1024px the nav's first tab and the page heading start at
visibly different x-positions. This slice resolves it by moving the hub out to meet the nav, which
is also what fixes the "admin content is too narrow" complaint.

## Scope (this slice)

**1. `components/layout/PageContainer.tsx`** — one component, three widths, one gutter:

| `width` | Class | Intent |
|---|---|---|
| `wide` | `max-w-7xl` (1280) | Matches the chrome exactly. Dashboards, lists, tables, product grids. |
| `standard` | `max-w-5xl` (1024) | Account pages, settings, record detail. |
| `narrow` | `max-w-2xl` (672) | Forms, auth, checkout, reading copy. |

All three render `mx-auto w-full px-4`, so horizontal margins and padding are identical even where
`max-width` differs. That is the property that actually fixes alignment — a page at `narrow` still
shares its gutter with the header.

`width` is **required**, with no default. A default is how a page silently inherits a width nobody
chose, which is the failure mode this slice exists to end.

**2. Apply it to all 60 pages**, replacing each hand-rolled `mx-auto … max-w-… px-4` container.
The per-page mapping is `requirements.md` R6 and R7 — it is a table rather than prose because
validation needs to check it page by page.

**3. A guard test**, `tests/page-container.test.ts`, failing if any page under `app/(admin)`,
`app/(storefront)` or `app/(landing)` hand-rolls its own top-level width container. Without it this
slice is a one-time tidy that drifts back; `#612` and `#626` are what that looks like in this repo.

**4. The scale recorded in `specs/design-system.md`** as a standing decision, since the next person
adding a page needs to know which variant to pick and why there are three.

**5. Two small additions to `scripts/verify-mobile-layout.ts`** — `--desktop` and `--measure
<selector>`. The script already drives local Chrome over CDP, already prints `documentScrollWidth`,
and already has `--sign-in`, which is exactly what this slice's validation needs. But `mobile: true`
is hardcoded at `:782`, so it cannot honestly measure a 1280px desktop layout, and it cannot report
an arbitrary element's box, which is what the alignment requirement turns on.

This is reuse-before-create, and it is also a correction. `#1177`'s validation hand-rolled a
bespoke CDP driver, and **that driver produced a false pass** — it reported a grouped nav link as
working when no mouse click ever navigated. A shared, reviewed measuring tool that prints numbers
and renders no verdict is the thing that does not do that. Its default output must stay
byte-identical, since other slices' validation already depends on it.

**6. Two defects found while taking the inventory**, both on lines this slice rewrites anyway:
- `app/(storefront)/products/[slug]/page.tsx:104` is `mx-auto grid max-w-4xl gap-6 sm:grid-cols-2` —
  **no `px-4` and no vertical padding at all.** The product detail page runs flush to the viewport
  edge on a phone. Fixed by the container.
- `app/(storefront)/help/page.tsx:83` uses `<div>`, not `<main>` — that page has no main landmark.
  Fixed by the container, which always renders `<main>`.

## Design decisions worth stating

**Vertical padding is preserved, not standardised.** The container takes `padY` (`default` = `py-8`,
`tight` = `py-6`) and every page keeps the vertical rhythm it has today. Vertical spacing is not
what is misaligned, and changing it would move the shopper's browse pages for no reason the
reported problem asks for. Two pages are exceptions and lose a few pixels: `/feedback` (`py-10`) and
`/dev` (`py-16`) both go to `py-8` rather than earn their own variants.

**`className` appends; it never overrides.** The repo has no `clsx` and no `tailwind-merge`, so a
passthrough that could collide with the container's own `px-4`/`max-w-*` would resolve by CSS
source order rather than intent. The guard test therefore rejects `max-w-`, `mx-auto` and `px-` in
a `PageContainer` `className`. Non-layout extras (`text-primary`, `space-y-8`) pass through fine.

**The four auth pages keep an inner `max-w-sm` card.** `/login`, `/register`, `/forgot-password`
and `/reset-password` are `max-w-sm` (384px) today. They sit in a `narrow` container for the shared
gutter, and keep their own card measure inside it. This is the one intentional nested width in the
slice: a container and a card are different things, and stretching a sign-in form to 672px would be
a visible downgrade sold as consistency.

**The legal and help pages get narrower, deliberately.** `/help`, `/privacy` and `/terms` are
`max-w-4xl` (896px) today and move to `narrow` (672px). 672px is roughly 75-80 characters, which is
the readable measure for body copy; 896px is past it. This is a readability improvement, not a
compromise forced by having only three variants.

## Deliberately excluded

- **Component-level `max-w-*` that are not page containers.** `DepartmentHero`'s `max-w-lg`
  caption, `LocationControl`'s dropdown, `StorefrontFooter`'s `max-w-6xl`, the cart drawer's
  `max-w-md`. These are component measures, not page geometry.
- **The product-grid column presets and the `#1173` collapsed-sidebar exception**
  (`specs/design-system.md:420-440`). Those steps are owner-tuned on purpose — "the owner chose
  these odd steps on purpose, since the freed sidebar width is what pays for the extra card."
  **Widening the category and search containers does not change them** (both are already `wide`),
  but they are the first place to look if a grid count shifts; `validation.md` R12 checks it
  explicitly.
- **Any responsive breakpoint change.** The variants differ only in `max-width`; every breakpoint
  behaves as it does today.
- **Any visual redesign.** No colour, type, border, shadow or component change. This slice moves
  edges and nothing else.
- **`StorefrontFooter`'s `max-w-6xl`** — it is chrome, not a page, and aligning it to `7xl` is a
  visible footer change that belongs to its own decision. Flagged as an open item below.

## Open items carried forward

- **`StorefrontFooter.tsx:105` is `max-w-6xl`** while every other chrome element is `max-w-7xl`.
  Left alone here to keep this slice to page containers; worth its own `/propose`.
- **`#1179`'s roadmap change-log row** rides this branch under the carry-forward rule in
  `.claude/commands/document.md`, and is what clears the `sdd:audit` gap currently open.
- The per-page `wide`/`standard`/`narrow` assignment for a handful of ambiguous admin settings
  pages (`/staff/storefront`, `/staff/loyalty`, `/staff/delivery-areas`) is a judgment call, not a
  derivation. They are `standard` because they are forms, not tables. Easy to move later; the
  container makes it a one-word edit.
