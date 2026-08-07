---
id: design-system
title: Design System
audience: [dev]
type: doc
status: approved
version: "1.0.0"
updated: 2026-08-06
visibility: internal
summary: The authored decision doc for Aheed's visual language — brand-kit colors, typography, shape tokens, and the open items (logo assets, danger-color role) carried into later phases.
tags: [design-system, tokens, brand]
---

# Design System

The authored decision doc for Aheed's visual language — colors, typography, shape. Where this and
`design-system/tokens/` (the implementation) disagree, this file governs; `tokens/` is regenerated
to match, never the reverse. Source: Aheed-supplied brand kit (colors, typeface, UI shape cues).

## Colors

Two-layer tokens: **primitive** (exact brand-kit hex, never referenced directly by components) →
**semantic** (what components actually use — `bg-action`, `text-primary`, etc.), so a future
palette revision only touches the primitive → semantic mapping, not every component.

| Primitive | Hex | Semantic | Role |
|---|---|---|---|
| `--color-brand-green-dark` | `#1B5E20` | `--color-primary` | Wordmark/headings, primary text-on-light |
| `--color-brand-green` | `#4CAF50` | `--color-action` | Primary buttons/links (brand kit's "Shop Now") |
| `--color-brand-orange` | `#F57C00` | `--color-accent` | CTA highlights, secondary emphasis |
| `--color-brand-red` | `#D32F2F` | `--color-danger` | Alerts; may double as a "sale" badge color |
| `--color-brand-cream` | `#F5F5F0` | `--color-surface-muted` | Page/section background, off-white |

Everything else (body text gray, borders, disabled states) uses Tailwind v4's stock neutral scale —
the brand kit gives no signal for these, so there's nothing brand-specific to encode.

Two hover/active shades (darker green, darker orange) are **derived** by reducing lightness on the
primitive, not sourced from the kit — marked `/* derived, not from brand kit */` in `tokens.css` so
they're never mistaken for an authoritative value.

## Typography

One family — **Poppins** — at two weights: SemiBold (600) for headings, Regular (400) for body.
Loaded via `next/font/google` (self-hosted at build time; no runtime request to Google Fonts, which
matters running on Workers). No second family; the brand kit never specifies one.

## Shape

Inferred from the brand kit's UI-elements panel (pill buttons/search, ~12–16px rounded cards,
circular icon buttons) — **not pixel-measured**, safe to revise once real UI comps exist:

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `0.5rem` | Small controls, inputs |
| `--radius-md` | `1rem` | Cards |
| `--radius-full` | `9999px` | Pills, circular icon buttons |

Spacing scale and breakpoints are **not brand-derived** — Tailwind v4's defaults are used as-is.

## What's deliberately not here yet

- **Logo files.** The brand kit is a reference image, not exported source assets (SVG/PNG).
  `public/images/brand/` stays an empty scaffold until real files exist.
- **`components/`, `design-system/{components,patterns,pages,guidelines}/`.** Nothing consumes
  tokens yet — first real usage is P1+ feature UI. Building these now would be speculative.
- **Dark mode.** No requirement yet; add when one exists.
- **Lint rule banning raw hex/px** (`specs/tech-stack.md`'s testing section, `docs/repo-structure.md`
  tags it P6) — deliberately deferred, not part of this slice.

## Open items carried into later phases

- **Red's exact role** (`--color-danger`) — the brand kit shows no UI example using it (no
  alert/badge in the kit). Confirm whether it's system-error-only or also a "sale/clearance" badge
  color before P2 storefront UI work makes badges visible to customers.
- **Real logo source files** — needed before any customer-facing page ships; placeholder-free
  scaffold (`public/images/brand/`) until then.

## Implementation

`design-system/tokens/tokens.css` — Tailwind v4 CSS-first `@theme` block encoding the tables above.
Imported by `app/globals.css` alongside Tailwind itself. See
`specs/2026-08-06-design-system/requirements.md` for the slice that introduced this.
