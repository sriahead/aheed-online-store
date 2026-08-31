---
id: error-boundary-gaps-plan
title: "Error boundary gaps — chrome, branding and design tokens (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-31
visibility: internal
summary: "Closes three defects left by #459's error-boundary slice: a root error.tsx that preserves neither site chrome nor per-vendor branding despite its plan claiming both, off-system Tailwind red where the audited danger tokens belong, and no test or executed validation of either boundary."
tags: [frontend, error-handling, design-tokens, multi-tenancy, p9]
related: [roadmap]
---

# Error boundary gaps — chrome, branding and design tokens (plan)

Closes **#478**, **#479** and **#467**. All three are defects in the artifact **#459** shipped on
2026-08-30 (PRs #464/#465/#466), found by re-reading that slice against the code at `/orient`
rather than against its own build notes — which recorded "Deviations from Spec: None."

They are one slice because they touch the same two files and the fix for #478 determines what the
test for #467 is even able to assert.

## What is actually wrong today

Read from the code, not from `specs/2026-08-30-global-500-error-boundary/`:

- **`app/error.tsx` preserves no chrome (#478).** Its plan says it "is rendered *inside* the
  existing root layout, meaning the site navigation, header, and footer will still be visible."
  `app/layout.tsx` renders `<html><body>{children}</body></html>` and nothing else. Header and
  footer live one level down, in `app/(storefront)/layout.tsx` → `components/layout/
  StorefrontChrome.tsx`. A root `error.tsx` is a sibling of the root layout, so it replaces the
  whole route-group subtree including that chrome.
- **Neither boundary carries vendor branding (#478).** `brandStyle()` is applied in exactly two
  places — `StorefrontChrome.tsx:30` and `app/(admin)/layout.tsx:41`. Both boundaries render
  outside both, so `bg-primary`/`text-primary`/`bg-surface-muted` fall through to `tokens.css`'s
  `:root` defaults. **SriMart renders Aheed's green on every 500.** This is the exact failure
  `CLAUDE.md`'s design-token section warns about, and nothing in `lint`/`typecheck`/`test` sees it.
- **Both use off-system colour (#479).** `bg-red-100 text-red-600` is Tailwind's stock palette. The
  design system has `--color-danger` / `--color-danger-tint` for this, and those literals are
  audited — P7 closeout (#251/#217) darkened `--color-danger` precisely because the raw brand red
  failed AA on the tint, and `tests/design-tokens-contrast.test.ts` asserts the 17 audited pairs.
  The stock pairing sits outside that audit. `app/not-found.tsx`, the sibling these files were
  visibly copied from, uses tokens.
- **Neither boundary has a test, and no validation row ever rendered one (#467).** The evidence
  recorded for #459 was a `200 OK` on a healthy page, which exercises no boundary at all.

## Approach

**One shared panel, four boundaries, layered deliberately.**

`components/errors/ErrorPanel.tsx` holds the branded markup once. Four boundary files supply it:

| File | Catches | Renders inside |
|---|---|---|
| `app/global-error.tsx` | a throw in the root layout | its own `<html>`/`<body>` — nothing else can exist |
| `app/error.tsx` | a throw in a route-group **layout** (e.g. `getCurrentVendorProfile()`) | root layout only |
| `app/(storefront)/error.tsx` | a throw in any storefront page | `StorefrontChrome` — header, footer, `brandStyle()` |
| `app/(admin)/error.tsx` | a throw in any staff page | admin chrome — `Header`, `PanelNav`, `brandStyle()` |

The two new group-level boundaries are what make the two-file design's stated rationale true. The
root `app/error.tsx` is **not** redundant once they exist: a boundary inside a layout cannot catch a
throw *from* that layout, so it stays as the outer fallback. That layering is the point.

**`global-error.tsx` keeps no branding, and that is not fixable.** The root layout is gone by
definition, so `brandStyle()` cannot have run. It is documented as a known limit rather than
papered over.

## Deliberately out of scope

- **The pre-existing raw-`red-*` drift** in `CampaignBannerUploader`, `VendorLogoUploader`,
  `InventoryTable` and `orders/lookup`. Recorded in #479's scope note; needs its own `/propose`.
- **Making `reset()` recover a config failure.** On a #430 fail-closed throw, `reset()` re-renders
  the same failing tree and throws again. The copy is adjusted so the button does not over-promise;
  changing the recovery semantics is a different decision.
- **A `not-found` change.** 404s go through `app/not-found.tsx` and are untouched.
