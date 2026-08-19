---
id: design-system
title: Design System
audience: [dev]
type: doc
status: approved
version: "1.7.0"
updated: 2026-08-19
visibility: internal
summary: The authored decision doc for Aheed's visual language — brand-kit colors, typography, shape tokens, per-vendor runtime theming (primitive + semantic override), and the open items (logo assets, danger-color role) carried into later phases.
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

> **Tokens are overridable per vendor at runtime (ADR-004 slice 4).** The `tokens.css` values are the
> **default (Aheed) vendor's** palette. The storefront layout injects the resolved vendor's colours as
> inline CSS custom properties on a wrapper element per request, recolouring the whole storefront with
> **no token or component change**. It must override **both layers**: the eight `--color-brand-*`
> primitives **and** the semantic tokens (`--color-primary`, `--color-action`, …) — because Tailwind v4
> emits the semantic tokens at `:root` as `var(--color-brand-*)` and the browser resolves that inner
> `var()` *at `:root`*, freezing the semantic value to the default palette; overriding only a primitive
> on a descendant never re-flows into it. The wrapper re-declares the semantic tokens with the same
> primitive→semantic mapping this file defines, so they resolve against the vendor's palette. The
> ~15%-darker hover shades are derived per vendor via `color-mix()` (no `VendorBranding` column needed).
> A named theme *catalogue* is deferred (#75).

| Primitive | Hex | Semantic | Semantic value | Role |
|---|---|---|---|---|
| `--color-brand-green-dark` | `#1B5E20` | `--color-primary` | = primitive | Wordmark/headings, primary text-on-light |
| `--color-brand-green` | `#4CAF50` | `--color-action` | **`#2E7D32`** | Primary buttons/links (brand kit's "Shop Now") |
| `--color-brand-orange` | `#F57C00` | `--color-accent` | **`#A85400`** | CTA highlights, secondary emphasis |
| `--color-brand-red` | `#D32F2F` | `--color-danger` | **`#C82D2D`** | Alerts; may double as a "sale" badge color |
| `--color-brand-cream` | `#F5F5F0` | `--color-surface-muted` | = primitive | Page/section background, off-white |

**Three semantic values deliberately diverge from their primitive** (P7 closeout, #251/#217). The
primitives still carry the exact brand-kit hex and are unchanged; only the semantic layer moved, so
all 45-plus call sites were corrected without touching a single component. **Do not "restore" the
brand hex into the semantic layer** — the brand values fail WCAG AA in the combinations the UI
actually renders:

| Pair | Brand value | Corrected |
|---|---:|---:|
| `--color-action` on white | 2.78:1 | 5.13:1 |
| white on `--color-action` | 2.78:1 | 5.13:1 |
| `--color-accent` on white | 2.70:1 | 5.34:1 |
| `--color-accent` on `--color-accent-tint` | 2.47:1 | 4.87:1 |
| `--color-danger` on `--color-danger-tint` | 4.36:1 | 4.75:1 |

The last of those is the standard error-message treatment (`text-danger` on `bg-danger-tint`, at
`text-sm`) used across checkout, the account forms and `OrderStatusBadge` — the text on the site
that most needs to be readable. `tests/design-tokens-contrast.test.ts` asserts all 17 pairs and
fails if any token regresses.

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

## Accessibility & Compliance

To ensure compliance with WCAG AA standards (minimum 4.5:1 contrast ratio for text) and robust screen reader support across all multi-tenant brands, the following design constraints are strictly enforced:

- **Opacity Minimums:** Never use opacity layers below `80%` (e.g. `text-primary/70` or `text-black/50`) for functional text or links against light backgrounds (white or `--color-surface-muted`), as they mathematically fall below the 4.5:1 contrast threshold. 
- **Button Contrast:** Primary and action buttons must use highly contrasting text colors (e.g., solid `bg-primary` or darker action variants) rather than standard brand greens, which often fail contrast requirements against white text. **Resolved at the token layer in P7 closeout (#251)** — `--color-action`, `--color-accent` and `--color-danger` now hold AA-passing values, so `bg-action` is safe with white text and this rule no longer has to be remembered per call site. `tests/design-tokens-contrast.test.ts` enforces it.
- **Semantic Landmarks:** All top-level navigation groups must be wrapped in a `<nav aria-label="...">` landmark.
- **Heading Hierarchy:** Component heading levels (`h1`, `h2`, `h3`) must not skip ranks in the document flow. Where a visual heading is absent but semantically required (e.g., a "Products" wrapper for `h3` product cards following a category `h1`), inject a visually hidden `<h2 className="sr-only">` to satisfy the hierarchy.
- **Interactive Elements:** Icon-only buttons (such as quantity increment/decrement controls) must carry explicit `aria-label`s, with inner icons marked `aria-hidden="true"`.
- **Modal surfaces:** A component that overlays the page (the cart drawer) must carry `role="dialog"`, `aria-modal="true"` and an `aria-labelledby` naming its own heading; move focus into itself on open, trap `Tab`/`Shift+Tab` within itself while open, restore focus to the opener on close, and close on `Escape`. A non-blocking banner (the cookie banner) must **not** trap focus — trapping there would be a defect, not compliance.

> **These rules predate their enforcement, and that gap cost something.** Every constraint in this
> section was written before P6.6 — yet `components/cart/CartDrawer.tsx`, added afterwards, broke
> three of them at once: icon-only close/quantity/remove controls with no `aria-label`, an `h2` to
> `h4` heading skip, and no dialog semantics or focus management at all. Prose in a spec nobody
> opens at the moment of writing a component is not a control. P7 closeout (#251) made these
> executable — `tests/a11y/*` asserts the modal and labelling rules,
> `tests/design-tokens-contrast.test.ts` asserts the contrast ones, and `eslint.config.mjs` runs
> `jsx-a11y`'s recommended set at `error` rather than as warnings nobody reads.

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
- **The cart is real as of P3a** (`components/cart/`). The cart drawer follows
  `docs/ui-ref/src/components/CartDrawer.tsx`'s structure — right-side slide-out, `max-w-md`,
  backdrop dismiss, header count, delivery-incentive banner — with its colours translated through
  the table above (`#1B5E20` → `bg-primary`, the incentive band's `emerald-50` → `bg-action-tint`,
  the remove control's hover red → `text-danger`). The mockup's `freeDeliveryThreshold = 30` is
  **vendor data** (`VendorConfig.freeDeliveryThresholdPence`), never a constant, and the banner is
  omitted entirely when a vendor sets no threshold.
- **Only the drawer's open/close is client-side.** Its contents are server-rendered and passed in as
  children, and the quantity/remove controls are plain `<form>` posts to server actions — so the cart
  works without client JS, keeping the progressive-enhancement stance above. The one other island is
  `AddToCartButton`, which exists solely because `ProductCard`'s body is a `<Link>` and the click
  must not navigate.

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
