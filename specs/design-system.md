---
id: design-system
title: Design System
audience: [dev]
type: doc
status: approved
version: "1.26.0"
updated: 2026-10-27
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

> **Tokens are overridable per vendor at runtime (ADR-004 slice 4) — but only where `tokens.css`
> still defines the semantic token as a `var()` alias of a primitive.** The storefront/admin layouts
> inject the resolved vendor's colours as inline CSS custom properties on a wrapper element per
> request (`lib/vendor-theme.ts`'s `brandStyle()`), recolouring parts of the app with no token or
> component change. It overrides the eight `--color-brand-*` primitives, plus `--color-primary`,
> `--color-surface-muted` and the three semantic tints (`--color-action-tint` etc.) — because
> Tailwind v4 emits those as `var(--color-brand-*)` at `:root`, and the browser resolves that inner
> `var()` *where the property is declared*, freezing the semantic value to the default palette unless
> a descendant re-declares the same alias against its own overridden primitive.
>
> **Updated 2026-08-20 (P7.5c+f, #255) — `--color-action`, `--color-accent`, `--color-danger` and
> the two hover shades ARE per-vendor again, but only through the contrast clamp.** P7 closeout
> (#251/#217) had decoupled them into audited literals and removed them from `brandStyle()`, because
> re-declaring them from a vendor's *raw* primitive silently overwrote the audited fix on every real
> page (an inline style always beats a stylesheet rule). That bought AA at the price of every vendor
> rendering the same buttons. `brandStyle()` now derives each from the vendor's own primitive and
> passes it through `clampForContrast` (`lib/color-contrast.ts`), which lowers OKLCH lightness until
> the value clears 4.5:1 against the surfaces it renders on, preserving hue and chroma — so SriMart's
> blue stays blue and still passes. `--color-primary` is clamped the same way, against white, the
> vendor's cream and all three tints.
>
> **The old rule and the new mechanism are not the same thing, and the difference is the whole
> point:** restoring a **raw brand hex** into the semantic layer is still forbidden (Aheed's own
> `#4caf50` and `#f57c00` measure 2.78:1 and 2.70:1 — the worst in the repo); a **value derived from
> it through the clamp** is how per-vendor colour is delivered. `tokens.css`'s audited literals
> remain the platform default for any request with no vendor branding, and
> `tests/design-tokens-contrast.test.ts` still guards them.
>
> **A named theme catalogue was built on 2026-09-07 (#75), and it changes nothing above.** `Theme`
> is a platform-level table of eight brand primitives; selecting one **copies** its values onto the
> vendor's `VendorBranding` row. `brandStyle()` still reads that row and performs no join, so every
> clamp described here applies unchanged — a theme is a starting point a vendor can then edit, not
> a second source of truth. It is additive convenience exactly as this line predicted, which is why
> the mechanism needed no revision to accommodate it.

| Primitive | Hex | Semantic | Semantic value | Role |
|---|---|---|---|---|
| `--color-brand-green-dark` | `#1B5E20` | `--color-primary` | = primitive | Wordmark/headings, primary text-on-light |
| `--color-brand-green` | `#4CAF50` | `--color-action` | **`#2E7D32`** | Primary buttons/links (brand kit's "Shop Now") |
| `--color-brand-orange` | `#F57C00` | `--color-accent` | **`#A85400`** | CTA highlights, secondary emphasis |
| `--color-brand-red` | `#D32F2F` | `--color-danger` | **`#C82D2D`** | Alerts; may double as a "sale" badge color |
| `--color-brand-cream` | `#F5F5F0` | `--color-surface-muted` | = primitive | Page/section background, off-white |
| (derived from `green-dark`) | — | `--color-primary-muted` | **`#49784E`** | Secondary/supporting **text** — clamped 4.5:1 |
| (derived from `green-dark`) | — | `--color-primary-subtle` | **`#77917A`** | Decorative `aria-hidden` **graphics** only — clamped 3:1 |

**The two muted foregrounds are DERIVED, not brand-kit values** (added 2026-09-07, #649). Each is
`mutedForeground(primitive, surfaces, alpha, ratio)` in `lib/color-contrast.ts`: the vendor's
`green-dark` composited over white at the alpha the old call sites used (0.7 for text, 0.4 for
graphics), then passed through `clampForContrast` against white, cream and all three tints. That
two-step shape — derive, then clamp — is the same one `darkenForHover` already uses, and it is why
the replacement preserves the appearance the 263 `text-primary/70`-style sites were reaching for
while guaranteeing the floor they missed. Both are re-declared per vendor in `brandStyle()`; a
token declared only here renders the default palette on every real page.

**Three semantic values deliberately diverge from their primitive** (P7 closeout, #251/#217). The
primitives still carry the exact brand-kit hex and are unchanged; only the semantic layer moved, so
all 45-plus call sites were corrected without touching a single component. **Do not "restore" the
raw brand hex into the semantic layer** — the brand values fail WCAG AA in the combinations the UI
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

**"Raw" is doing real work in that rule (P7.5c+f, #255).** Writing a brand primitive *straight* into
the semantic layer stays forbidden, and the table above is why. Deriving a semantic value from that
primitive through `clampForContrast` is a different operation with the opposite outcome — it cannot
produce a value below the ratio it was given — and it is how per-vendor colour is delivered at
runtime (see the blockquote under "Colors"). The values tabulated above remain the platform default
for any request that resolves no vendor branding. A reader applying the rule literally to a clamped
derivation would be rejecting the mechanism that enforces it.

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

Icons are rendered by **one component, `components/icons/Icon.tsx`**, addressed by a **semantic name**
from the registry, `components/icons/registry.ts` (ADR-008, #1223). A component never names an icon
library and never receives an icon as a component value: navigation models and lookup tables carry
**names** (strings), as `components/staff/nav-items.ts` and `components/product/category-icon.ts` do.

```tsx
<Icon name="search" className="h-4 w-4" />               // decorative: aria-hidden by default
<Icon name="search" label="Search" />                     // the sole content of a control: role="img"
<Icon name="circle-check" tone="action" size="md" />      // vendor-themed colour, token-scale size
```

The artwork is Iconify data **bundled at build time** by `npm run icons:build` into
`components/icons/generated/icon-data.ts`; nothing is fetched at runtime, which is why the CSP is
unchanged. Changing a provider is an edit to one registry line followed by that command. CI runs
`npm run icons:check` and fails on a stale generated file. Where each set comes from, and why, is in
`specs/decisions/ADR-008-icon-system.md`.

### Tiers

| Tier | Use | Source | Colour |
| --- | --- | --- | --- |
| `functional` | controls and navigation: chevrons, close, plus, search, check | Lucide only (a compile error otherwise) | `currentColor` |
| `status` | alerts and confirmations; never colour alone, the glyph shape differs too | Noto Emoji (#1239; previously Lucide/Phosphor) | colourful multi-path SVG |
| `decorative` | trust strip, rewards, features, nav, buttons, cards, empty states; rating `star` on Lucide | Noto Emoji (#1239; previously Phosphor duotone / Lucide) | colourful multi-path SVG with namespaced internal gradient IDs; rating `star` on Lucide (`fill="none"`) |

A registry key is a generic noun (`trash`, `delivery`), never a provider id or a numeric suffix. An
existing key never changes provider or tier: a decorative variant of an icon that is also used
functionally gets a **new** name (`gift` stays Lucide; the Rewards two-hue gift is `rewards-gift`). On a
dark surface (the Rewards launcher and panel) a duotone glyph keeps its amber class and takes no tone, since
the vendor tokens are contrast-clamped against light surfaces only.

### Department illustrations

Each department with art shows a **Noto Emoji** illustration (Apache-2.0), mapped slug by slug in
`components/icons/illustrations.ts` (16 slugs, grocery and electronics; nothing else is mapped). They are
**static files**, `public/illustrations/departments/<slug>.svg`, written by `npm run icons:build` and shown
with `<img>` through `ImageWithFallback`, **not inlined**: `DepartmentScroller` and `DepartmentHero` are
client components, so inlined art would ship in the client bundle. A slug with no illustration renders the
neutral decorative `tag` glyph, never a picture of food on a non-grocery vendor (#729). The strip keeps its
64 pixel tile, now a circular `IconMedallion` on `action-tint` for every tile (#1288; it alternated with
`accent-tint` before), with the illustration inset to 80 %; the hero corner uses `DepartmentGlyph` (96 pixels,
128 from `md`), also a medallion. Per-vendor and generated art is `#1224`.

Licences for every set in use, and the Noto Emoji note (its upstream licence URL returns 404, so the
canonical Apache 2.0 text is used), are in `public/third-party-icon-licenses.txt`, linked from the storefront
footer as "Third-party credits".

### The circular medallion — the only frame (#1288)

Every 3D icon, every large decorative icon and every category image renders inside **one** component,
`components/icons/IconMedallion.tsx`: a `rounded-full` circle on the vendor's tint, so the whole set
reads as one family whichever artwork fills it.

```tsx
<IconMedallion icon3d="storefront" size={24} decorative />        // 3D icon (static cut-out or AI override)
<IconMedallion icon="package" size={32} className="mx-auto" decorative /> // large flat icon
<IconMedallion imageUrl={photoUrl} fallbackIcon={glyph} size={64} active /> // category photo
```

- **Tint.** `action` by default (`bg-action-tint`, which `brandStyle()` sets per vendor);
  `accent` and `danger` only where the colour carries meaning (a pending or cancelled order, an
  error). The department strip uses `action` for every tile; it no longer alternates tints.
- **Fill.** A photo or an AI override fills the circle (`object-cover`) with `mix-blend-multiply`, so
  the plain white background every AI prompt asks for takes on the tint. A transparent cut-out (a static
  3D asset or a department illustration, `imageFit="inset"`) sits at 80 %; vector art at 70 %. The
  storefront has no dark theme; the multiply blend assumes a light tint and needs revisiting if one lands.
- **The 32 px rule.** A decorative or status `<Icon>` drawn at 32 px or larger (`size="xl"|"2xl"`, or an
  `h-8`/`w-8` class or larger) goes through the medallion; anything smaller stays a plain inline glyph
  and is never AI-replaced. Functional icons are never framed. `<Icon3D>` is used only inside
  `components/icons/`. `tests/icon-medallion-coverage.test.tsx` enforces both.
- **Size.** `size` is the outer diameter and replaces the icon box it stands for, so layout does not
  shift. A responsive size uses `md:!h-32 md:!w-32` (the `!` beats the inline size), as `DepartmentGlyph`
  does.
- **Product photography is never framed**: product cards, galleries and quick view stay square.
- **Overrides.** Which icons a vendor can replace with AI art, and how, is ADR-008 Decision 6 and the
  "Replaceable icon inventory" in `docs/client-help-centre/icon-and-visual-asset-standards.md`.

### Size scale

`size` takes a token and sets the SVG's `width` and `height`. With no `size` the icon is 24 pixels,
the `lucide-react` default, so a caller's own `className` (`h-4 w-4`) keeps deciding the size.

| Token | `xs` | `sm` | `md` | `lg` | `xl` | `2xl` |
| --- | --- | --- | --- | --- | --- | --- |
| Pixels | 12 | 16 | 20 | 24 | 32 | 48 |

### Tone

`tone` adds a text colour class from tokens that `brandStyle()` already emits per vendor and
contrast-clamps, so **no new token exists and `brandStyle()` is unchanged**. A duotone icon's second
layer reads `--icon-secondary`; when a tone is set, `Icon` points it at a second vendor token.

| `tone` | Class | Second hue (duotone) |
| --- | --- | --- |
| `current` | none | none, drawn as designed |
| `muted` | `text-primary-muted` | none |
| `primary` | `text-primary` | `var(--color-accent)` |
| `action` | `text-action` | `var(--color-accent)` |
| `accent` | `text-accent` | `var(--color-action)` |
| `danger` | `text-danger` | `var(--color-accent)` |

No tone class carries an alpha modifier (see the alpha rule under Accessibility). Red is not used on a
new decorative surface; `danger` exists for alerts and for the landing page's existing Order Updates
tile.

### Compatibility rules

- **The presentation attributes sit on the root `<svg>`**, as `lucide-react` renders them, so a root
  class such as `fill-current` (the favourite heart) or `fill-amber-400` (star ratings) still works.
  Iconify's Lucide data repeats them on every child, which the generator hoists (R13 of
  `specs/2026-10-22-icon-system/`).
- **`@iconify-json/lucide` is held at the release matching the installed `lucide-react`**; a newer one
  redrew several icons. `tests/icon-lucide-parity.test.ts` compares geometry, normalised, and fails on
  any divergence not listed with a reason.
- **`Icon` is decorative unless it has a `label`.** An icon-only control carries its own `aria-label`
  and the icon inside stays `aria-hidden`.

## Shape

Originally inferred from the brand kit's UI-elements panel (pill buttons/search, ~12–16px rounded
cards, circular icon buttons). **Rewritten 2026-09-07 (#653) to describe the scale the application
actually uses.** Every token below is set to the value that utility already rendered — the slice
that wrote this table changed no corner anywhere:

| Token | Utility | Value | Use |
|---|---|---|---|
| `--radius` | `rounded` | `0.25rem` | Small inline chips and swatches |
| `--radius-lg` | `rounded-lg` | `0.5rem` | Small controls, badges |
| `--radius-xl` | `rounded-xl` | `0.75rem` | Form inputs and most buttons |
| `--radius-2xl` | `rounded-2xl` | `1rem` | Cards and panels — the dominant surface radius |
| `--radius-3xl` | `rounded-3xl` | `1.5rem` | Large feature panels |
| `--radius-full` | `rounded-full` | `9999px` | Pills, circular icon buttons |

**Every step in use is declared, and no step is declared twice.** Tailwind v4's `@theme` *merges*
with its default scale rather than replacing it, so a partial override produces silent aliases
between a token-backed utility and an un-overridden default one. That is what this table previously
described: overriding only `sm` and `md` made `rounded-sm` identical to `rounded-lg` and
`rounded-md` identical to `rounded-2xl`, while the two most-used radii named no token at all.
`rounded-sm` and `rounded-md` are therefore **retired** — their call sites were rewritten to the
identical-rendering `rounded-lg` and `rounded-2xl` — and `tests/radius-scale.test.ts` fails if any
two distinct `rounded-*` utilities in use ever resolve to the same value again.

Note `--radius` (bare `rounded`) is genuinely theme-backed and belongs in this table: the rounded
family registers `themeKeys: ["--radius"]`, so leaving it undeclared would make it the one radius
in use still depending on a Tailwind default.

Spacing scale and breakpoints are **not brand-derived** — Tailwind v4's defaults are used as-is.
The one named spacing step is `tap` (below).

## Touch targets (#961, 2026-10-02; #964 and #979, 2026-10-04; #981, 2026-10-06)

`--spacing-tap: 2.75rem` (44px) in `design-system/tokens/tokens.css` generates `h-tap`, `w-tap`,
`size-tap`, `min-h-tap` and `min-w-tap`. It is a size, not a colour, so `brandStyle()` never
overrides it and it needs no second-vendor check.

**The storefront's primary shopping controls are at least 44×44 CSS px below `lg`** and keep their
compact desktop size from `lg`. Those controls are:

- the product card's add control — a single `+` since `#1185`. It replaced an "Add" text button and
  a `sm:`-and-up pre-add minus/plus picker, which `#956` had deliberately kept and the owner removed
  on 2026-10-20. The card still swaps to `CartQuantityStepper` on the first add, so the pre-add
  picker was the only quantity choice lost, and `#961` had already hidden it below `sm`;
- the product card's favourite control (`#232`), 48px inboard of the corner below `sm` and at the
  corner from `sm` up, because the corner is the Quick View button's below `sm`. **48px, not the
  44px tap token:** neither control sits inside `.skew-card-inner`, so the card's skew renders both
  46px wide, and a 44px offset overlapped them by 2px (measured at `#232`'s validation);
- the in-cart `CartQuantityStepper`'s minus and plus;
- the card's mobile Quick View button;
- the header's Shop, Shop List, Sign In and Account links.

`#964` extended the rule to the rest of the storefront's tappable controls. Each area carries a
`data-tap-surface` hook that the measuring script groups by, and `tests/tap-targets.test.ts` guards
both the hook and the `tap` class:

- `location`: `LocationControl`'s Collect/Delivery toggles, its change-postcode pencil, and the
  single Delivery button;
- `location-dialog`: the postcode dialog's input, its Check postcode button and Cancel;
- `filter-chips`: each applied-filter chip and "Clear all";
- `filter-panel`: the mobile filter disclosure's `<summary>`, which was already 50px tall and
  carries the hook only;
- `subcategories` and `collections`: the subcategory pills and the collection links;
- `pagination`: Previous page and Next page on the category and search pages;
- `cart-line-controls`: each cart line's decrease, increase and remove buttons, in the drawer and on
  `/cart`;
- `scroller-arrow`: `HorizontalScroller`'s left and right arrows. Every row that uses it gets
  them: departments, product rows and bundle rows.

`#979` covered the controls `#964` left out, with the same hooks and test:

- `search`: the header search input. It has no submit button; Enter submits. On a phone it sits in
  its own header row, which gives back the 6px the input grew, so the product grid does not move;
- `filter-form`: every field, select, checkbox label and the Apply button in `ProductFilterForm`,
  in the mobile panel and the `md`+ sidebar. A checkbox is hit through its wrapping `<label>`, so
  the label carries the size;
- `cart-drawer-close` and `quick-view-close`: the two drawers' close buttons;
- `quick-view-add`: Quick View's pre-add minus and plus (the `drawer` variant of
  `AddToCartButton`). The stepper's 1px border made them 42px tall in the old fixed 44px row, so
  below `lg` the row takes its height from them and Add stretches to match;
- `gallery-arrow`: the Quick View carousel's previous and next arrows, a 44px button around the same
  32px circle.

`#981` covered the review controls `#979` left out, on **both** surfaces that render them — Quick
View and the product page, which share `ReviewForm` and `StarRatingInput`:

- `quick-view-body`: Quick View's Submit/Update review, each review's Delete, the error state's
  Try again, and the signed-out "Log in" link;
- `product-reviews`: the product page's review form, its per-review Delete and its signed-out
  "Log in" link;
- `feedback-form`: `/feedback`'s star input and its submit button. It is here because it shares
  `StarRatingInput`, not because `#981` named it — and sharing a component means sharing the
  rule, so it is measured rather than assumed.
- **`StarRatingInput`'s per-star `<label>` is the tap target**, not the `Star` icon. The radio is
  absolutely positioned to fill the label, so the label is the box a finger hits; `STAR_SIZES`
  (`h-5 w-5` / `h-6 w-6` / `h-7 w-7`) is unchanged, so the visual star is the same size it always
  was. This is the "small visual, large hit area" rule below, applied to a label rather than a
  button.
- **A 44px star row does not fit beside its rating label at 360px, so the row wraps.** Measured
  inside Quick View: the review form has 288px of content box, five 44px stars plus their gaps are
  228px, but adding the row gap and the label's `min-w-[75px]` needs 313px. `flex-wrap` on that row
  drops the label to its own line instead of widening the page. At the old 32px stars the same row
  was 253px, which is why this only appeared once the stars grew.

Some facts behind the rule:

- **The breakpoint is `lg`, not `sm`.** A 640–1023px viewport is a tablet, and a tablet is a touch
  device. `pointer-coarse:` would be more exact, but no tool available to validation can emulate a
  coarse pointer, so it could not be measured.
- **This is above the conformance floor, by choice.** WCAG 2.2 SC 2.5.8 (AA) needs only 24×24, which
  every control already met. 44px is SC 2.5.5 (AAA) and Apple's 44pt, chosen because the
  most-tapped controls were the smallest and adjacent minus and plus mis-taps change quantities.
- **A small visual can keep a large hit area.** The Quick View button is a 44px button around a
  28px circle, and each scroller arrow is a 44px button around its 32px circle. Make the *button*
  `tap`-sized, not the icon.
- **Below `sm` the card hides its pre-add quantity picker.** About 128px of card content cannot
  hold two 44px buttons, a quantity and Add. One tap adds one, and the in-cart stepper takes over.
- **The pattern is `min-h-tap … lg:min-h-0`** (or `size-tap … lg:size-auto` for an icon button).
  The control grows to at least 44px below `lg` and keeps its exact pre-`#964` size from `lg`.
- **Still outside the rule:** the gallery's dot buttons, which the arrows and swiping duplicate
  (SC 2.5.5's "equivalent" exception); and the staff panel. A new storefront control should adopt
  `tap` from the start.

Measure at real widths with `scripts/verify-mobile-layout.ts` (headless Chrome over the DevTools
protocol). Desktop Chrome cannot go below 501px, and the app's `frame-ancestors 'none'` rules out
an iframe. A control that only renders to a signed-in shopper needs the script's `--sign-in`
(`#981`); before that existed the script was always a guest, and the review forms could not be
measured at a phone width by any tool.

## The header wordmark truncates (#982, 2026-10-06)

**A vendor with no `logoStorageKey` gets a wordmark — an initial tile, the name in two spans and
the locality — and that block must be allowed to shrink.** The brand container carries `min-w-0`
rather than `shrink-0`, the logo image carries its own `shrink-0` so the logo path keeps its
reserved footprint, and every text node in the wordmark truncates.

The failure this prevents is not a clipped name, it is a **sideways scroll on every page**: a flex
item refuses to shrink below its content width by default, so a long name widened the whole
document instead. Measured on dev before the fix, with a 36-character logo-less name: a requested
360px viewport rendered at **477px**. "Aheed Food Centre" alone no longer overflowed by this point,
so the defect was only reachable with a longer name — which is exactly why it needs a structural
fix rather than a name-length assumption.

This matters for multi-tenancy (ADR-004): a new vendor onboarding without a logo is ordinary, not
exceptional, and nothing validates a vendor's name length.

## Brand assets: lockup and mark (#1069)

A vendor's brand has **two image slots**, both on `VendorBranding` and both relative storage keys
(ADR-003). Both are uploaded on `/staff/storefront`.

- **The logo (lockup)**, `logoStorageKey`: a single WebP. It renders in a fixed **72×40** box
  below 768px (`h-10 aspect-9/5 object-contain`) and a **128×64** (2:1) box from 768px
  (`md:h-16 md:aspect-2/1`), reserved before the image decodes (#329, #655). A lockup
  supplied at **about 2:1** fills the desktop box (about 9:5 fills the phone one). A wider one is letterboxed, and its small text shrinks
  with it: a 2.3:1 lockup's second line is about 9px tall.
- **The square mark**, `markStorageKey`: one upload, which the browser turns into five PNGs in one
  folder. The column stores the `512.png` key, and `lib/vendor-mark.ts` derives the other four.

| File | Size | Background | Used for |
|---|---|---|---|
| `32.png` | 32×32 | transparent | `<link rel="icon">`, and the target of `/favicon.ico`'s redirect |
| `180.png` | 180×180 | the vendor's cream | `<link rel="apple-touch-icon">` (iOS paints transparency black) |
| `192.png` | 192×192 | transparent | `<link rel="icon">`, the manifest, and the header mark |
| `512.png` | 512×512 | transparent | the manifest |
| `og.png` | 1200×630 | the vendor's cream, mark 480px centred | `og:image`: the link preview in WhatsApp, Facebook and iMessage |

**`og.png`'s background is the cream at upload time.** Changing the colours later does not regenerate
it; re-uploading the mark does.

A source is contained in the square, never cropped, and must be at least 512px on its longer edge.

**Header rule** (`components/layout/HeaderBrand.tsx`) — **amended by #1077, 2026-10-13**:

| Vendor has | Below 768px (`md`) | From 768px |
|---|---|---|
| logo and mark | the logo, 72×40 | the logo, 128×64 |
| logo only | the logo, 72×40 | the logo, 128×64 |
| mark only | the wordmark, with the mark in the initial tile's 40×40 box | same |
| neither | the wordmark | same |

**The first two rows are deliberately identical, and that is a reversal.** #1069 shipped the mark
below 768px and the logo from 768px, as one `<picture>` with a `(min-width: 768px)` source — so the
browser downloaded only the candidate it showed, which mattered because the logo is the storefront's
largest asset (#243). Owner testing the next day (2026-10-13) found the 40×40 mark too small to
identify the store on a phone and judged there to be room for the lockup, so **a vendor with a logo
now renders that logo at every width** and the two cases are one code path. The `<picture>` is gone;
`ImageWithFallback`'s `sources` prop has no caller until a second one arrives.

**The mark is unaffected everywhere else.** It is still the favicon, the apple-touch icon, the
manifest icons and `og:image` — each read from `markStorageKey` independently of the header — and it
still replaces the initial tile in a **logo-less** vendor's wordmark. Uploading a mark remains
worthwhile for every vendor; it simply no longer appears in the header of a vendor who also has a
logo.

**72×40 over anything larger, by decision.** It is the box logo-only vendors already render at that
width in production, so it needed no re-measurement — and the width budget there is known to be
tight: #655 measured the logo-less wordmark overflowing a 360px header by 22px. A bigger phone box
is a change that has to be measured with `scripts/verify-mobile-layout.ts` first, not assumed.

Everything above is per vendor and read from the database. **Nothing brand-specific lives in
`public/` or `app/`**: those are shared by every vendor, so one static favicon would show one
vendor's mark on another's site (ADR-004). A vendor with no mark gets no icon links, no
`og:image`, `icons: []` in the manifest and a 404 for `/favicon.ico`, exactly as before.

Not supported, by decision: SVG uploads (an SVG can carry script), a footer logo or a
light-on-dark variant, maskable icons, and a true multi-resolution `.ico`.

## Dark surfaces: the storefront footer (#1055, 2026-10-12)

The footer is the one storefront surface painted in the vendor's **dark** brand colour
(`--color-primary`), so its text has to be light. **No semantic token covers that.** Every themed
foreground `brandStyle()` emits is clamped against the LIGHT surfaces (white, cream, the tints), and
Aheed's `--color-accent` on its own dark green measures about 3.1:1.

- The footer's colours come from `footerPalette(primitives)` in `lib/footer-palette.ts`:
  - `background` is the clamped `--color-primary`;
  - `text` comes from `cream`;
  - `heading` comes from `orange`;
  - `muted` comes from `cream`, darkened, then clamped.
  Each foreground is clamped to **4.5:1 against the footer background**, and `clampForContrast`
  lightens when the background is dark.
- They are applied as footer-local custom properties (`--footer-bg`, `--footer-text`,
  `--footer-heading`, `--footer-muted`) inline on `<footer>`, and read as
  `text-[var(--footer-…)]`. **No hex literal, no `tokens.css` entry, and no alpha modifier on text.**
- A malformed stored primitive falls back to the platform default, as in `brandStyle()`. A throw
  there would take down every storefront page.
- Measured for Aheed and SriMart in `lib/footer-palette.test.ts`.

A future dark surface reuses `footerPalette`; it does not reach for `--color-accent` on a dark
background.

### Footer layout rules (#1060, 2026-10-12)

- **Today's opening-hours row** is bold in `--footer-heading` and carries `aria-current="date"`.
  "Today" is the store's calendar day (`STORE_TIMEZONE`), computed per request.
- **Contact channels** render as a row of **44px circles** (`size-tap`, bordered in
  `--footer-text`) under the "Shop with us" links. The list, its order, links and labels come
  **only** from `contactChannels()` in `lib/contact-channels.ts`, the same source
  `FloatingContact` renders, and the icons only from `components/layout/contact-channel-icons.tsx`.
  Never add a channel to one surface alone.
- **The bottom bar is one grid, `lg:grid-cols-[2fr_1fr_1fr]`**: company details and "Powered by",
  then the legal links, then the Stripe line and badges. That is an exact 50 / 25 / 25, because the
  gaps sit between tracks. It switches at `lg`, not `md`: a quarter column at 768px cannot hold the
  Stripe line or five badges on one line. Below `lg` it stacks **payment, legal, company**, via
  `order-*`, so the DOM order stays the desktop reading order.
- **The legal links** sit on one line (`whitespace-nowrap`), separated by `aria-hidden` dots. All
  three share one style: no underline until hover.
- **The footer clears the floating buttons.** Its bottom padding (`pb-40`, `sm:pb-44`) is taller
  than the stack on the right: the cart button at `bottom-6`/`sm:bottom-8`, and the contact trigger
  at `bottom-24`/`sm:bottom-28` with `h-12`. So scrolled to the end, no footer content sits under
  Rewards, the cart or the contact trigger. **Moving any floating button higher means raising this
  padding too.**

## Page width: one container, three steps (#1180, 2026-10-20)

**Every page's top-level container is `components/layout/PageContainer.tsx`.** A page does not write
its own `mx-auto … max-w-… px-4`; `tests/page-container.test.ts` fails if it does.

| `width` | Class | For |
|---|---|---|
| `wide` | `max-w-7xl` (1280) | Matches the chrome exactly. Dashboards, lists, tables, product grids, browse. |
| `standard` | `max-w-5xl` (1024) | Account pages, settings, record detail, the cart and checkout (#1305). |
| `narrow` | `max-w-2xl` (672) | Forms, auth, reading copy. |

**All three render `mx-auto w-full px-4`, and that shared gutter is the point** — not the
`max-width`. A `narrow` page still shares a left edge and a gutter with the header; it just stops
sooner. Alignment comes from the gutter being identical, which is why the three variants are
allowed to differ in width at all.

**`width` is required and has no default.** A default is how a page silently inherits a width
nobody chose, which is the drift this replaced: before `#1180` there were four different content
widths under the `max-w-7xl` chrome in the admin alone, and seven across the storefront. The admin
hub sat 128px inboard of the nav heading it; `/staff/categories` rendered its table in 672px.

**`className` appends and cannot override.** The repo carries no `clsx` and no `tailwind-merge`, so
two competing `max-w-*` classes would resolve by stylesheet source order rather than by intent —
silently, and potentially differently per build. The guard test rejects `max-w-`, `mx-auto` and
`px-` in that prop. Non-layout extras (`text-primary`, `space-y-8`) pass through.

**Vertical padding is preserved per page (`padY`: `default` = `py-8`, `tight` = `py-6`), not
standardised.** Vertical rhythm was never the thing misaligned, and flattening it would move the
shopper's browse pages for no reason the problem asked for.

**One nested width is intentional.** `/login`, `/register`, `/forgot-password` and
`/reset-password` keep a `max-w-sm` card *inside* a `narrow` container. A card is not a page
container; stretching a sign-in form to 672px would be a visible downgrade sold as consistency.

**Reading copy goes `narrow`, not wider.** `/help`, `/privacy` and `/terms` moved from `max-w-4xl`
(896px) to 672px — roughly 75-80 characters, the readable measure. Wider is not better for prose.

**Chrome that is still not on this scale:** `StorefrontFooter.tsx` is `max-w-6xl` while every other
chrome element is `max-w-7xl`. Left alone by `#1180` deliberately — it is chrome, not a page.

## Product grids (#962, 2026-10-02)

**Every product listing renders through `components/product/ProductGrid.tsx`**, never through a
`grid-cols-*` class written at the call site. Today that covers the category, search and bundles
pages; `tests/product-grid-usage.test.ts` fails if one of them writes its own columns, or if the
old `2 / 3 / 4` string reappears anywhere. Columns come from the vendor's
`VendorConfig.productGridDensity` preset, mapped to literal class strings in
`lib/product-grid-density.ts`. Tailwind only emits classes it finds as source text, so a column
count computed at runtime would silently never reach the stylesheet. That is why a vendor picks a
preset, never a number.

| Preset | Below `sm` | `sm` | `md` | `lg` | `xl` |
|---|---|---|---|---|---|
| `COMPACT` | 2 | 2 | 2 | 4 | 6 |
| `STANDARD` (default) | 2 | 2 | 2 | 4 | 4 |
| `SPACIOUS` | 1 | 2 | 2 | 2 | 4 |

Rules for any future preset:

- **Every multi-column step is even.** An odd step leaves short pages ragged (a 3-column step
  rendered 8 products as 3 + 3 + 2).
- **Four columns never start before `lg`.** `FilterPanel`'s 240px sidebar from `md` leaves about
  500px, roughly 110px per card at four.
- **Six only from `xl`.**
- **No free per-vendor column count.** It allows layouts that break the card.

**Exception: the hidden filter sidebar (#1173, 2026-10-19).** On the category and search pages a
shopper can hide the browse sidebar (`components/product/CollapsibleSidebar.tsx`). While it is
hidden, `<html>` carries `data-filters-collapsed` and `app/globals.css` adds one column from `lg`.
The grid is scoped to `[data-filters-layout] [data-product-grid][data-density=…]`, so `/bundles`
never changes. The owner chose these odd steps on purpose, since the freed sidebar width is what
pays for the extra card. A short page may end ragged in this state; only the shopper sees it, and
only after hiding the sidebar.

| Preset, sidebar hidden | `lg` | `xl` |
|---|---|---|
| `COMPACT` | 5 | 7 |
| `STANDARD` | 5 | 5 |
| `SPACIOUS` | 3 | 5 |

The state lives in `sessionStorage` (`FILTERS_COLLAPSED_KEY`, listed on `/privacy`) and is restored
before paint by `FILTERS_COLLAPSED_SCRIPT`. Below `md` the attribute changes nothing. With
JavaScript off there is no toggle and the sidebar always shows (#568).

## Accessibility & Compliance

To ensure compliance with WCAG AA standards (minimum 4.5:1 contrast ratio for text) and robust screen reader support across all multi-tenant brands, the following design constraints are strictly enforced:

- **NO ALPHA MODIFIER ON A THEMED FOREGROUND TOKEN — EVER, AT ANY PERCENTAGE.** Not `text-primary/80`, not `/70`, not `/60`. Use `text-primary-muted` (secondary text, clamped 4.5:1) or `text-primary-subtle` (decorative `aria-hidden` graphics only, clamped 3:1). **This rule replaced an "opacity minimums / never below 80%" rule on 2026-09-07 (#649), and the reason the old wording failed is the important part.** It named a threshold, which invited the reading that `/80` was safe — and `/80` was the row that actually mattered: for Aheed it measures **4.80:1 on white and 4.41:1 on the tints**, passing and failing depending on which surface it lands on, while SriMart passes both. A per-vendor, per-surface failure cannot be expressed as a percentage floor. More fundamentally: `brandStyle()` passes every semantic foreground through `clampForContrast`, and **an alpha modifier composites that clamped value straight back below the floor** — so the better the clamp works, the worse the modifier renders. The rule was also unenforced prose for the entire life of the project and reached **299 sites across 83 files**. It is now `tests/token-alpha-purity.test.ts`, which walks the filesystem and fails the build. Alpha modifiers in **background, border and ring** positions are out of scope and remain legal — they are surfaces and boundaries, not text (`#641` tracks one open question there). `text-black/60` and above also remain legal: `black` is not a themed token, no vendor varies it, and 5.74:1 is verified once rather than per vendor.
- **A PLACEHOLDER CANNOT BE MADE FAINTER THAN THE SECONDARY-TEXT TOKEN (measured #1077, 2026-10-13).** Owner testing asked for the "Shop your list" placeholder to look fainter, because its worked example list read as content the shopper had already typed. There is no colour that does it: `placeholder:text-primary-muted` (Aheed's `#49784e`) measures **5.21:1**, and the lowest value the rule above permits, `text-black/60`, measures **5.74:1** — so every legal colour is *more* prominent than the token already in place, and `/50` and `/40` (3.98:1 and about 3.0:1) are barred by `tests/token-alpha-purity.test.ts`. **Fix placeholder prominence with CONTENT, not colour**: make the placeholder a one-line prompt that cannot be mistaken for data and move worked examples into a hint beside the field. The ask is not unreasonable — it is unachievable within AA, and reaching for the colour is the wrong instinct to repeat.
- **Focus is `focus-visible:`, with a ring — never `focus:outline-none` alone.** The standard treatment is `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2`, carried by `inputClass`/`buttonClass` in `lib/form-classes.ts`. Two things it fixes (#650): `focus:` fires on mouse click as well as keyboard, and a 1px border-colour change — the previous replacement at 27 sites — fails WCAG 2.2 SC 2.4.11's indicator-area requirement **and disappears entirely in forced-colors mode**, where the user's own setting overrides author border colours and the suppressed system outline is not there to fall back on.
- **An invalid field needs `aria-invalid` and `aria-describedby`, not just a red border.** `errorInputClass` is colour and border only; alone it satisfies neither SC 1.4.1 (Use of Colour) nor SC 3.3.1 (Error Identification). The four staff forms return both from one `fieldProps(name)` helper so a field cannot be styled invalid without being announced invalid.
- **Button Contrast:** Primary and action buttons must use highly contrasting text colors (e.g., solid `bg-primary` or darker action variants) rather than standard brand greens, which often fail contrast requirements against white text. **Resolved at the token layer in P7 closeout (#251)** — `--color-action`, `--color-accent` and `--color-danger` now hold AA-passing values, so `bg-action` is safe with white text and this rule no longer has to be remembered per call site. `tests/design-tokens-contrast.test.ts` enforces it.
- **Semantic Landmarks:** All top-level navigation groups must be wrapped in a `<nav aria-label="...">` landmark.
- **Heading Hierarchy:** Component heading levels (`h1`, `h2`, `h3`) must not skip ranks in the document flow. Where a visual heading is absent but semantically required (e.g., a "Products" wrapper for `h3` product cards following a category `h1`), inject a visually hidden `<h2 className="sr-only">` to satisfy the hierarchy.
- **Interactive Elements:** Icon-only buttons (such as quantity increment/decrement controls) must carry explicit `aria-label`s, with inner icons marked `aria-hidden="true"`.
- **Modal surfaces:** A component that overlays the page (the cart drawer) must carry `role="dialog"`, `aria-modal="true"` and an `aria-labelledby` naming its own heading; move focus into itself on open, trap `Tab`/`Shift+Tab` within itself while open, restore focus to the opener on close, and close on `Escape`. A non-blocking banner (the cookie banner) must **not** trap focus — trapping there would be a defect, not compliance.
- **Disclosure surfaces** (added P2.6 slice 5, #568). A surface that reveals content **in place**, without blocking the page behind it, is a native `details` disclosure — not a dialog. It must **not** carry `role="dialog"`, `aria-modal`, a focus trap or an `Escape` handler; adding them there is the same category error as trapping focus in the cookie banner, just in the other direction. Two things follow from choosing `details` rather than a client-controlled panel, and both are the point rather than a side effect: it works with **no client JavaScript**, and because every interaction inside this storefront's filter surfaces is a real navigation, the next page arrives with the disclosure closed on its own — no `usePathname` effect, and so no exposure to the dependency-array trap `CLAUDE.md` records for the cart drawer. **The deciding question is not "does it slide in?" but "can the shopper still do this with JavaScript off?"** `#568`'s mobile filter panel looks exactly like a drawer and is a disclosure, because the filters it holds are reachable today at every viewport without JavaScript, and putting them behind a JS-only opener would have removed a capability rather than added one. The cart drawer is legitimately a dialog by the same test: `/cart` is a real page behind it, so nothing is lost when its JavaScript does not run.
- **What may and may not be duplicated across a disclosure's two branches** (added 2026-09-09, #681). `FilterPanel` renders `ProductFilterForm` **twice** — once inside the below-`md` `details` disclosure, once inside the `md`-and-above `aside` — because CSS cannot move one node between two containers. That is safe **only** because of a property that file states explicitly: the form uses no `id` attributes and labels by wrapping its inputs, so nothing is duplicated that the accessibility tree or a `form=` reference could confuse. **The general rule is that the exemption is narrow and does not extend to landmarks.** A `nav`, `main`, `header`, `aside` or anything carrying an `aria-label` renders **once**, outside both branches — two copies put two identically-named landmarks in the accessibility tree, which is a real defect for a screen-reader user navigating by landmark even though it is invisible on screen. `#681`'s `CollectionNav` therefore sits above the panel rather than inside it, which has the second benefit of keeping the storefront's collection entry points visible on a narrow viewport instead of collapsing them behind the disclosure — **an entry point hidden by default is not an entry point**. When adding anything to a duplicated branch, the question to ask is: would two of these confuse the accessibility tree? If yes, it belongs outside.

- **Motion** (added P8.5a, #345). Three rules, all learned from defects rather than chosen:
  1. **A transition names its properties.** Never `transition-all`, and never a global
     element-selector transition rule. A global rule caused the page-refresh layout thrashing
     removed in #324; the blanket `transition-all` sweep that followed silently broke the carousel
     dot in #326, because Tailwind v4's default `transition` property list contains no `width`.
  2. **Animate only properties that cannot move layout** — `transform`, `opacity`, `box-shadow`,
     `clip-path`. Anything that reflows belongs in a reserved box instead (see #329's header logo).
  3. **Every motion effect has a reduced-motion opt-out.** CSS effects use
     `@media (prefers-reduced-motion: reduce)`; a JS-driven timer (an auto-rotating carousel)
     checks `matchMedia` and does not start. `app/globals.css`'s `.skew-card` block and
     `components/layout/DepartmentHero.tsx` are the respective reference implementations.
     (This line named the since-deleted promo-carousel component until 2026-09-07; it was
     replaced by `DepartmentHero.tsx` in P8.5b and the pointer went stale in both this doc and
     `app/globals.css` — corrected in #651. The dead name is deliberately not repeated here, so a
     future reader grepping for it finds only real references.)
     WCAG SC 2.2.2 in particular (moving content lasting more than five seconds needs a
     pause/stop/hide mechanism) is only ever verified in a browser.
  4. **A transform written as a Tailwind utility carries its own `motion-reduce:` variant**
     (added #651). Rule 3's CSS block is **class-scoped** and reaches only the classes it names;
     `transform` is not inherited, so `transform: none` on `.skew-card-inner` does nothing for a
     `group-hover:scale-105` on the image inside it. That exact gap shipped on the product card and
     survived for a full milestone — under `prefers-reduced-motion: reduce` the card correctly
     stopped skewing and lifting, and still ran a 500ms image zoom.
     **Do not "fix" this by widening the CSS block to a global selector.** It was considered and
     rejected on two counts: a blanket `transition-duration` override also removes the
     `box-shadow`/`border-color` transitions rule 3's block deliberately keeps (hover would stop
     being perceivable at all), and a blanket `transform: none` breaks the seven **static**
     `-translate-y-1/2` centring transforms in this repo — search icons detach from their inputs,
     carousel controls mis-position — for reduced-motion users only. This is the same reasoning
     behind rules 1 and 2: a rule declared where it cannot see which properties will change must
     not be allowed to govern `all` of them.
     `tests/motion-reduce-coverage.test.ts` enforces it — so unlike rules 1-3, **this one is
     checked**.

> **These rules predate their enforcement, and that gap cost something.** Every constraint in this
> section was written before P6.6 — yet `components/cart/CartDrawer.tsx`, added afterwards, broke
> three of them at once: icon-only close/quantity/remove controls with no `aria-label`, an `h2` to
> `h4` heading skip, and no dialog semantics or focus management at all. Prose in a spec nobody
> opens at the moment of writing a component is not a control. P7 closeout (#251) made these
> executable — `tests/a11y/*` asserts the modal and labelling rules,
> `tests/design-tokens-contrast.test.ts` asserts the contrast ones, and `eslint.config.mjs` runs
> `jsx-a11y`'s recommended set at `error` rather than as warnings nobody reads.

## Primitives (`components/ui/`, #656, 2026-09-07)

`Card`, `Button` and `FormField`. Three rules govern them, and each exists because of a specific
defect rather than a preference:

1. **They are server components, and must stay that way.** No `"use client"`. Progressive
   enhancement is load-bearing here — server-rendered forms post to server actions and work with no
   JavaScript. A primitive that needed client JS to render a field would remove a capability, not
   add an abstraction.
2. **They compose `lib/form-classes.ts`, they do not re-declare it.** That module already holds
   `inputClass`, `labelClass`, `errorInputClass`, `buttonClass` and `uppercaseInputClass` as shared
   strings. The primitives add *markup* on top; duplicating the strings would recreate exactly the
   divergence both layers exist to prevent.
3. **`FormField` emits `aria-invalid` and `aria-describedby` together or not at all.** A field
   cannot be styled invalid without also being announced invalid. This generalises the `fieldProps`
   pattern the staff forms adopted in #650.

**Why this layer arrived when it did.** `#649` (299 alpha-modified colour utilities failing AA) and
`#650` (27 suppressed focus outlines) each reached double-digit site counts from a *single* author
decision, copied into 11 and 15 files. That is what a missing control-geometry layer costs, and it
is the evidence the original deferral was waiting for. Colour and motion were already systematised;
shape, control geometry and interaction states were not.

**Adoption is incremental and deliberately unfinished.** The primitives have a handful of call sites
each; 87 card-surface lines and 24 button sites spanning 17 distinct geometry combinations remain
un-migrated. Migrating a route group at a time and verifying after each is the intended shape of the
follow-on work — a single sweep would be an unreviewable diff.

**Not built, and not for lack of a complete-looking set:** `Toast` and `Skeleton`. Nothing in the app
dispatches a toast and there are zero `loading.tsx` files. Building a primitive because the list has
a gap is the same speculative reasoning retired above, and it is still wrong for those two.

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
- **Icons** come from `components/icons` (see Icons above); `components/product/category-icon.ts` maps
  a category slug to an icon **name** with a neutral `tag` **default fallback**, so a category added to
  the DB later still renders an icon without a schema change.
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
- **The header department selector** (`components/layout/DepartmentSearchBar.tsx`, #1173) sizes to
  its selected label with `field-sizing: content` (3.5–10rem, with a 5.5rem fallback). Where
  `appearance: base-select` is supported, it opens a styled picker with token colours. The
  base-select trigger lays its contents out as blocks, so it needs
  `display: inline-flex; align-items: center; white-space: nowrap`. Without that, the label sits at
  the top and the arrow wraps under a short label such as "All" (found at Validate, `57efaff`).
- **Logo**: `public/images/brand/logo.png` is `docs/logo.png` with whitespace trimmed and flattened
  to white; shown `h-11` on mobile, `h-16` on desktop. The mobile header adds a dedicated
  full-width search row (the inline search is hidden below `sm`).

## What's deliberately not here yet

- **`design-system/{components,patterns,pages,guidelines}/`.** Still empty, still deliberate. The
  UI primitives live in `components/ui/` beside the code that uses them; a second parallel
  component tree under `design-system/` would need a reason neither #656 nor this slice found.
  `design-system/tokens/` remains the one populated subdirectory.

  **The `components/` half of this bullet was retired on 2026-09-07 (#656).** It read "Nothing
  consumes tokens yet — first real usage is P1+ feature UI. Building these now would be
  speculative," and it was correct when written, before P1. It stopped being correct somewhere
  around P7 and nobody noticed, because the deferral had no stated expiry — the evidence that the
  patterns had stabilised was the copy-paste itself. See the Primitives section below.
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

---

## Token and branding traps (learned the hard way)

Moved here from `CLAUDE.md` in #786, which now carries only the one-line rule — a `tokens.css` edit
does not reach a browser if `brandStyle()` also lists that token — and a pointer to this section.

- **A jsdom test that parses `tokens.css` directly proves the file is right — it proves nothing
  about what a browser actually renders, because `lib/vendor-theme.ts`'s `brandStyle()` injects a
  second, competing set of CSS custom properties as an inline `style` on every page's root element
  (ADR-004 decision 5, per-vendor branding), and an inline style always beats a `:root` stylesheet
  rule on specificity.** `brandStyle()` re-declares each semantic token it lists from that vendor's
  raw primitive colour — correct for `--color-primary`/`--color-surface-muted`/the three semantic
  tints, which really are simple `var()` aliases of a primitive in `tokens.css` and need the
  per-element re-declaration to pick up an override at all (a custom property's `var()` substitutes
  once, where the property is *declared* — a descendant overriding the referenced primitive does not
  make an ancestor's already-computed alias recompute). It is **wrong** for any semantic token
  `tokens.css` has decoupled into an independent literal value, because re-declaring it from a
  primitive silently reintroduces whatever `tokens.css` moved away from. Hit in P7 closeout (#251):
  darkening `--color-action`/`--color-accent`/`--color-danger` (plus hover shades) for WCAG AA
  landed cleanly in `tokens.css` and its contrast test passed, but every real page kept rendering the
  pre-slice, AA-*failing* hex — found only by pulling live rendered HTML from `npm run preview`
  against staging at `/validate`, not from the test suite. **Before trusting a `tokens.css` edit,
  check whether `brandStyle()` also lists the token being changed** — if it does and the change is
  meant to be a fixed, audited constant rather than something that should keep tracking a vendor's
  brand colour, remove it from `brandStyle()`'s per-vendor list too, or the CSS file's value never
  reaches a browser.
- **SriMart's `VendorBranding` primitives are real, live-differentiated colours (`#1e88e5` blue,
  `#8e24aa` purple, `#c62828` red), not filler test data** — a change that assumes every vendor
  looks like Aheed's default green/orange/red will visibly break SriMart's theme, and nothing in
  `lint`/`typecheck`/`test` checks a second vendor's rendered output. Curl or otherwise fetch a page
  with `Host: srimart-staging.nocaped.com` (or `srimart.nocaped.com` in production) under
  `npm run preview` before treating a branding/token change as verified.
- **A local `VendorDomain.host` value that includes a port can never resolve — seed it port-less,
  always, even for local-only testing.** `lib/tenant.ts`'s `getCurrentVendorIdOrNull()` runs every
  request host through `splitHostPort(...).hostname` before the `VendorDomain` lookup, which always
  strips the port — deliberate and correct, since a real `Host` header on
  `staging.aheedfoodcentre.nocaped.com`/`nocaped.com` never carries one. A row seeded with a port
  (e.g. `SEED_SRIMART_HOST=srimart.localhost:8787`, the value a from-scratch local seed might
  reasonably reach for) silently can never match, and the request falls through to `/coming-soon` —
  indistinguishable from "this host genuinely isn't mapped," no error anywhere. The line above
  already models the right convention (`srimart-staging.nocaped.com`, no port, reused as the local
  `Host` header value even though nothing is actually listening on that domain — only the header
  string matters to `getCurrentVendorIdOrNull()`, not where the TCP connection actually goes) but
  didn't say why it has to be port-less until this was hit live: `/validate` for #501 slice A
  (2026-09-01, `#514`) found a dev-DB row seeded as `srimart.localhost:8787` in an earlier session,
  fixed by rewriting it port-less. Any `SEED_SRIMART_HOST`/`SEED_AHEED_HOST` value — local, staging,
  or production — must never contain a port.
- **Don't assume a local Worker's `VendorDomain` rows use the `nocaped.com` staging convention this
  file's own bullets above model — query the connected database before writing (or trusting)
  `curl -H "Host: ..."` commands against `npm run preview`.** A mandatory two-vendor check written
  into `validation.md` (accessibility remediation, 2026-09-07, `#649`) hardcoded
  `aheedfoodcentre.nocaped.com`/`srimart-staging.nocaped.com` as the local `Host` header values, on
  the assumption every developer's local dev DB is seeded that way. The session that actually ran
  `/validate` had a dev DB seeded instead with `localhost:8787` (Aheed) and `srimart.localhost`
  (SriMart) — both requests to the documented hostnames silently redirected to `/coming-soon` (0 or
  2+ vendors, no host match — `lib/tenant.ts`'s documented fallback), with no error and no hint
  which of "wrong host" or "feature broken" was true. Resolved by connecting Prisma directly
  (`prisma.vendor.findMany()` / `prisma.vendorDomain.findMany()`) against the same `DATABASE_URL`
  `npm run preview` uses, reading the real seeded `host` values, and re-running with those instead —
  which then passed cleanly. **Before trusting any hardcoded `Host` header in a spec or a memory of
  a previous session, query `VendorDomain` in the environment actually under test** — which
  hostnames resolve which vendor is a property of that specific database's seed history, not a
  platform-wide constant.
- **A `grep` for a retired hex literal against a page's SAVED, rendered HTML can match even when the
  literal has been correctly removed from every component's own source, because `brandStyle()` must
  legitimately re-embed that exact hex string as a CSS custom-property VALUE for whichever vendor's
  primitive happens to equal it.** Hit at P9.2's admin-panel-operability `/validate` (2026-09-06,
  R22b, `#631`): the retired literals `#e8f5e9`/`#f5f5f0` were removed from every `.tsx` file (proven
  by a source-level AST/regex sweep with zero matches), yet `grep -E '#(2e7d32|e8f5e9|c8e6c9|f5f5f0)'`
  against `/staff/inventory`'s saved HTML still matched four times — both inside the rendered
  `style="--color-action-tint:#e8f5e9;--color-surface-muted:#f5f5f0;..."` attribute and again inside
  the page's own RSC hydration payload carrying the identical string as JSON, because Aheed's own
  brand-tint and cream primitives are numerically identical to the hex codes the components used to
  hardcode. This is the same class this file already records for `<1%` and unescaped `&` in rendered
  HTML — an absence-check against live output can false-positive on the exact mechanism proving the
  fix works, not just false-negative on an escaped character. **A live-HTML grep for a retired colour
  literal is only meaningful against a *second* vendor whose primitives differ from the value being
  retired** (SriMart's `#1e88e5`/`#8e24aa`/`#c62828`, per the bullet above) — checked against the
  vendor whose primitive happens to coincide with the old hardcoded value, it cannot distinguish "the
  literal is gone from the page" from "the literal is still exactly what this vendor's own brand
  colour resolves to." Confirm the real claim (no literal in component source) with the source-level
  test instead, and treat a live-HTML hex match as inconclusive rather than a failure until checked
  against a vendor it should NOT match.

