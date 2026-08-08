---
id: design-system
title: Design System
audience: [dev]
type: doc
status: approved
version: "1.4.0"
updated: 2026-08-08
visibility: internal
summary: The authored decision doc for Aheed's visual language — brand-kit colors, typography, shape tokens, per-vendor runtime theming, and the open items (logo assets, danger-color role) carried into later phases.
tags: [design-system, tokens, brand, multi-tenancy]
---

# Design System

The authored decision doc for Aheed's visual language — colors, typography, shape. Where this and
`design-system/tokens/` (the implementation) disagree, this file governs; `tokens/` is regenerated
to match, never the reverse. Source: Aheed-supplied brand kit (colors, typeface, UI shape cues).

## Colors

Two-layer tokens: **primitive** (exact brand-kit hex, never referenced directly by components) →
**semantic** (what components actually use — `bg-action`, `text-primary`, etc.), so a future
palette revision only touches the primitive → semantic mapping, not every component.

> **Primitives are overridable per vendor at runtime (ADR-004 slice 4).** The eight `--color-brand-*`
> values in `tokens.css` are the **default (Aheed) vendor's** palette; they mirror
> `VendorBranding`'s eight hex columns. The storefront layout injects the resolved vendor's
> primitives as inline CSS custom properties on a wrapper element per request — because the semantic
> layer references the primitives via `var()`, this recolours the whole storefront with **no token or
> component change**. The derived hover shades and the semantic mapping are unchanged and stay
> Aheed-tuned (no `VendorBranding` column). A named theme *catalogue* is deferred (#75).

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

Three tint shades — light backgrounds for badges/banners — **are** sourced from the brand kit
(`#E8F5E9`/`#FFF3E0`/`#FFEBEE`) and confirmed against the mockup's own `docs/ui-ref/src/index.css`.
Named `--color-action-tint`/`--color-accent-tint`/`--color-danger-tint`, relative to their base
color — the same convention as the hover/active shades above, not a new "success/warning" status
vocabulary this project has never used. The brand kit's fourth tint (`#FAFAFA`, "light neutral") is
not added as a token — it's near-identical to the already-existing `--color-surface-muted`
(`#F5F5F0`) and a separate near-duplicate token would only invite drift between the two.

| Primitive | Hex | Semantic | Role |
|---|---|---|---|
| `--color-brand-green-tint` | `#E8F5E9` | `--color-action-tint` | Light backgrounds behind action-colored badges/banners |
| `--color-brand-orange-tint` | `#FFF3E0` | `--color-accent-tint` | Light backgrounds behind accent badges (e.g. discount) |
| `--color-brand-red-tint` | `#FFEBEE` | `--color-danger-tint` | Light backgrounds behind danger/alert badges |

## Typography

One family — **Poppins** — at two weights: SemiBold (600) for headings, Regular (400) for body.
Loaded via `next/font/google` (self-hosted at build time; no runtime request to Google Fonts, which
matters running on Workers). No second family; the brand kit never specifies one.

The brand kit's explicit type scale (H1 32px Bold, H2 24px Semibold, H3 18px Semibold, Body 14px
Regular, Small 12px Regular) maps to Tailwind's existing utility scale rather than new CSS
tokens — close enough that a parallel token set would just be indirection:

| Brand kit | Tailwind utility |
|---|---|
| H1 — 32px Bold | `text-3xl md:text-4xl font-bold` |
| H2 — 24px Semibold | `text-2xl font-semibold` |
| H3 — 18px Semibold | `text-lg font-semibold` |
| Body — 14px Regular | `text-sm font-normal` |
| Small — 12px Regular | `text-xs font-normal` |

## Icons

**lucide-react** — confirmed as the mockup's actual choice (`docs/ui-ref/src/components/*.tsx`
import every icon from it). Components import icons directly from `lucide-react`; no wrapper
component, no hand-rolled SVG set.

## Shape

Inferred from the brand kit's UI-elements panel (pill buttons/search, ~12–16px rounded cards,
circular icon buttons) — **not pixel-measured**, safe to revise once real UI comps exist:

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `0.5rem` | Small controls, inputs |
| `--radius-md` | `1rem` | Cards |
| `--radius-full` | `9999px` | Pills, circular icon buttons |

Spacing scale and breakpoints are **not brand-derived** — Tailwind v4's defaults are used as-is.

## Storefront components (P2.5b2)

The first real storefront UI built against these tokens, matching the AI Studio mockup
(`docs/ui-ref/`). The mockup's raw hex/`slate-*` are **translated to semantic tokens**, never
copied literally:

| Mockup element | Mockup color | Our token / utility |
|---|---|---|
| Promo bar, logo mark, cart button, Halal badge | `#1B5E20` | `bg-primary` |
| Fresh badge | emerald ≈ `#4CAF50` | `bg-action` |
| Offer badge, "Food Centre" wordmark | `#F57C00` | `text-accent` / `bg-accent` |
| "Save £X" discount badge | red `#D32F2F` | `bg-danger` |
| Soft hero / active-nav / category-chip background | light green `#E8F5E9` | `bg-action-tint` |
| Card / input surfaces, borders | `slate-*` | `bg-surface-muted`, `border-black/10` (stock neutral) |
| Rating star | amber-400 | stock Tailwind `text-amber-400 fill-amber-400` |

- **The rating star deliberately uses stock Tailwind `amber-400`**, not a brand token — gold is a
  decorative, non-brand convention, and this file already defers all non-brand color to Tailwind's
  scale. It's the one "raw" color allowed in a card, and it's a utility class, not a hex literal.
- **Icons** come from `lucide-react` (see below); `components/product/category-icon.ts` maps a
  category slug to its icon with a generic-basket **default fallback**, so a category added to the
  DB later still renders an icon without a schema change.
- **The header is a Server Component** (`components/layout/Header.tsx`) — it reads the session and
  renders auth state (account link vs. sign-in) with zero client JS, the same
  progressive-enhancement stance as the GET-form search/filters.
- **Cards and the cart button render `Add`/cart controls that are inert** until P3 wires a real
  cart — visual fidelity without a fake count.

### Browse-page layout (post-review revision)

- **Departments** render as a **horizontal, icon-led strip** across the top of the home, category,
  and search pages — `components/layout/DepartmentScroller.tsx`. It scrolls via ‹ / › arrow buttons
  with the scrollbar hidden (`.no-scrollbar` in `app/globals.css`). This is the **one client
  component** in the storefront chrome (`"use client"`): the arrows drive `scrollBy`, and it
  degrades to native touch/trackpad scrolling without JS, so no behaviour is lost. Data still comes
  from the server as props (like `ProductCard`), not fetched in the component. It replaced the
  earlier vertical `CategorySidebar` (removed).
- **Search + filters** sit in a **vertical left sidebar** on the category/search pages —
  `components/product/ProductFilterForm.tsx`, a stacked panel (search, price range, speciality
  checkboxes, Apply), still a plain `<form method="GET">` (zero-JS, real navigation resets
  pagination).
- **Logo**: `public/images/brand/logo.png` is `docs/logo.png` with whitespace trimmed and flattened
  to white; shown `h-11` on mobile, `h-16` on desktop. The mobile header adds a dedicated
  full-width search row (the inline search is hidden below `sm`).

## What's deliberately not here yet

- **`components/`, `design-system/{components,patterns,pages,guidelines}/`.** Nothing consumes
  tokens yet — first real usage is P1+ feature UI. Building these now would be speculative.
- **Dark mode.** No requirement yet; add when one exists.
- **Lint rule banning raw hex/px** (`specs/tech-stack.md`'s testing section, `docs/repo-structure.md`
  tags it P6) — deliberately deferred, not part of this slice.

## Resolved (previously open items)

- **Real logo source files** — resolved 2026-08-07: `docs/logo.png` committed. `public/images/brand/`
  scaffold now has a real source to work from.
- **Red's exact role** (`--color-danger`) — resolved 2026-08-07, confirmed against the mockup's
  `docs/ui-ref/src/components/ProductCard.tsx`: both system alert/danger **and** the sale/discount
  badge color. No separate token needed for the sale-badge use — same primitive, same semantic.

## Implementation

`design-system/tokens/tokens.css` — Tailwind v4 CSS-first `@theme` block encoding the tables above.
Imported by `app/globals.css` alongside Tailwind itself. See
`specs/2026-08-06-design-system/requirements.md` for the slice that introduced this.
