---
id: icon-system-plan
title: "Colourful, vendor-themed, provider-agnostic icon system (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-22
visibility: internal
summary: One Icon component over a semantic-name registry and build-time bundled Iconify data (Lucide functional, Phosphor duotone decorative, Noto department illustrations), themed per vendor from existing tokens. Phases 1 to 4a of issue 1223.
tags: [icons, design-system, theming, iconify, accessibility, multi-tenancy]
related: [adr-008-icon-system, adr-004-multi-tenancy, design-system, tech-stack]
---

# Colourful, vendor-themed, provider-agnostic icon system (plan)

Issue `#1223`, approved by the owner on 2026-10-22 ("go ahead with recommendation"). The proposal
that preceded this spec is summarised on the issue; the decision record is
`specs/decisions/ADR-008-icon-system.md`. This file is the narrative a validator who was not in the
conversation needs in order to trust `requirements.md`.

**Goal:** make the storefront's icons colourful in the style of a modern delivery app (glossy
department illustrations on tinted tiles, two-hue glyphs elsewhere) **without** tying any component to
an icon library, **without** breaking per-vendor branding, and **without** adding a runtime network
dependency. Shipping this proves that one icon change can be made in one file (the registry) and that
a second vendor's palette reaches the icons with no new tokens.

## What exists today (measured 2026-10-22, base `docs/1216-document-pass`)

- 107 files import `lucide-react`; **141 distinct icons** are in use (a single-line grep reports 85 and
  undercounts multi-line imports). Sizing is Tailwind classes on the icon (`h-4 w-4` appears 175 times).
- Icons are passed around as **component values**: `AccountNav`'s `NavLink` takes an `icon` component
  prop, `components/staff/nav-items.ts` types `icon: LucideIcon`, `ViewSwitcher` and `PanelNav` read
  `item.icon`, and `components/product/category-icon.ts` returns a component. These are the type leaks
  the registry removes.
- **Callers rely on Lucide's SVG structure.** Lucide-react puts `fill="none"` and the stroke attributes
  on the root `<svg>`, so Tailwind classes such as `fill-current` (the favourite heart, `FavouriteButton`)
  and `fill-amber-400` (star ratings) override them on the root. The Iconify Lucide data puts those
  attributes on every child instead, where a root class cannot reach them. A naive swap would silently
  hollow every filled star and heart. This is why R13 exists. `DepartmentHero` also passes
  `strokeWidth` (1.25) to its fallback glyph, so the wrapper must accept it (R20).
- Three tests select Lucide's generated class names (`svg.lucide-circle-user-round` and similar) and one
  imports icon objects.
- `components/layout/DepartmentScroller.tsx` and `DepartmentHero.tsx` are **client components**. Anything
  inlined into them ships in the client bundle, which is why illustrations are static `<img>` files.
- The CSP (`next.config.mjs`) allows `connect-src 'self' https://*.r2.cloudflarestorage.com` and
  `img-src 'self' data: https://*.nocaped.com`. Iconify's public API is allowed by neither, so icon
  data is bundled at build time and nothing is fetched at runtime.
- `brandStyle()` (`lib/vendor-theme.ts`) already emits per-vendor, contrast-clamped
  `--color-primary`, `--color-action`, `--color-accent`, `--color-danger` and the three tints inline, and
  inline beats `tokens.css` (the #251 trap). **This slice adds no token and does not touch
  `brandStyle()`**: icons read the variables it already emits, so the trap cannot recur.

## Scope (this slice, five PRs)

| PR | Phase | Visual change | Contents |
| --- | --- | --- | --- |
| 1 | P1 Foundation | none | ADR-008, design-system/tech-stack/CLAUDE.md text, devDependencies, generator, registry, `Icon`, parity test, licence file, `category-icon` and `nav-items` moved to semantic names, the three coupled tests rewritten, `scripts/verify-icon-markup.ts` |
| 2 | P2a Storefront migration | none | every `lucide-react` import under storefront code replaced by `Icon`; each icon's `className` carried over verbatim and no `size` prop set (the size scale is for new usage), so the rendered SVG attributes do not change |
| 3 | P2b Admin/staff migration | none | the rest, plus the import-ban guard test |
| 4 | P3 Colour | yes | decorative two-hue glyphs on the surfaces listed below |
| 5 | P4a Illustrations | yes | static department illustrations on the department strip and hero |

P1 to P2b are required to be behaviour-preserving: any difference in the rendered SVG inventory is a
defect, not a taste question (R34, R35). Colour is introduced only after that is proven.

### Architecture (decisions; the rationale is in ADR-008)

- `components/icons/registry.ts`: `ICON_REGISTRY`, keyed by **semantic name**, each entry
  `{ tier, provider, id }`. Names are generic nouns (`search`, `delivery`, `chevron-down`), never a
  provider's id with a numeric suffix. Changing a provider is a one-line registry edit.
- `scripts/build-icons.ts` (`npm run icons:build`) reads the installed `@iconify-json/*` packages and
  writes **only the registry's icons** to `components/icons/generated/icon-data.ts`, plus
  `public/third-party-icon-licenses.txt` and (P4a) the illustration assets. `npm run icons:check`
  rebuilds in memory and diffs; CI runs it from `.github/workflows/quality.yml`.
- `components/icons/Icon.tsx`: server-compatible, no hooks, renders an inline `<svg>` with
  `data-icon="<name>"`. Props: `name`, `size` (`xs` 12, `sm` 16, `md` 20, `lg` 24, `xl` 32, `2xl` 48
  pixels, default 24 to match `lucide-react`), `tone`, `label`, `className`, `style`, `strokeWidth`.
- **Tiers** (the registry field): `functional` (Lucide only; controls and navigation), `status`
  (Lucide or Phosphor; alerts, success), `decorative` (Phosphor duotone; meaning is in adjacent text).
  Department illustrations are a fourth, separate mechanism: `components/icons/illustrations.ts` and
  static files, not inline SVG.
- **Two-hue glyphs.** Phosphor's duotone bodies share one pattern: a single layer carrying
  `opacity=".2"` (1,524 of 1,526 duotone icons; the two exceptions are `cell-signal-none` and
  `wifi-none`). The generator rewrites that layer to
  `style="fill:var(--icon-secondary,currentColor);opacity:var(--icon-secondary-opacity,.2)"` and fails if
  the pattern is absent. With no `tone` the icon looks as Phosphor drew it; with a `tone`, `Icon` sets
  `--icon-secondary` to a second vendor token and `--icon-secondary-opacity` to `.7`. Verified in
  headless Chromium on 2026-10-22: `var()` resolves in both a presentation attribute and a `style`
  attribute (computed `fill` read back as the token's value).
- **Tone map (single source in `Icon.tsx`).** `tone` adds a text colour class; the secondary layer takes
  the paired token:

  | tone | class | secondary layer |
  | --- | --- | --- |
  | `current` | none | none |
  | `muted` | `text-primary-muted` | none |
  | `primary` | `text-primary` | `var(--color-accent)` |
  | `action` | `text-action` | `var(--color-accent)` |
  | `accent` | `text-accent` | `var(--color-action)` |
  | `danger` | `text-danger` | `var(--color-accent)` |

  `danger` exists only because the landing page's Order Updates tile already uses it today; this slice
  does not add red to any new decorative surface.
- Existing pairs already satisfy contrast: `brandStyle()` clamps each foreground against white, the
  vendor's cream and its own matching tint (primary against all three tints). The secondary layer is
  decorative and exempt from the non-text contrast rule, but it never carries meaning.

### Phase 3 surfaces (exhaustive)

| File | Icons converted to decorative two-hue | Tone today kept |
| --- | --- | --- |
| `app/(landing)/page.tsx`, trust strip section (three tiles) | `Truck` (line 206), `CreditCard` (line 222), `BellRing` (line 234) | primary, accent, danger, on the tile tints already there |
| `components/rewards/RewardsLauncher.tsx` | `Gift` | accent |
| `components/rewards/RewardsPanel.tsx` | `Sparkles` | accent |
| `components/rewards/WaysToEarnAccordion.tsx` | `Coins`, `Sparkles`, `UserPlus` | accent, accent, action |
| `components/rewards/WaysToRedeemAccordion.tsx` | `Gift`, `ShoppingBag`, `Percent` | accent, action, primary |
| `components/rewards/AvailableRewardsSection.tsx` | `Gift` | accent |

Everything else in those files (close `X`, `ChevronDown`, `Lock`, `CheckCircle2`, `Check`, `Copy`,
`Share2`, `Users`) stays functional or status Lucide. A registry name has one provider and tier for the
whole app, so where an icon is decorative here and functional elsewhere (`Gift`, `Sparkles` and `Truck`
are candidates) the decorative use gets its own new semantic name (for example `rewards-gift`); no
existing name changes provider (R38).

### Phase 4a: department illustrations

16 slugs map to Noto Emoji (Apache-2.0) ids; the generator writes one SVG per slug to
`public/illustrations/departments/<slug>.svg` (about 71 KB in total, measured). Mapping: `fruit-veg`
red-apple, `bakery` croissant, `dairy-eggs` glass-of-milk, `halal-meat` cut-of-meat, `groceries`
shopping-cart, `international` globe-showing-europe-africa, `beverages` hot-beverage, `snacks` cookie,
`household` soap, `frozen-foods` ice-cream, `health-beauty` lipstick, `baby-kids` teddy-bear,
`pet-supplies` dog-face, `fish` fish, `sri-electronics` headphone, `sri-home` light-bulb. Any other slug
renders a neutral decorative `tag` glyph, never a grocery picture (#729). The slug-to-art map lives in
code, exactly as `category-icon.ts` does today; making it data-driven is `#1224`.

## Deliberately excluded (so the question is not re-asked)

- **`AccountNav`, `PanelNav`, `ViewSwitcher` and every staff-panel icon stay monochrome.** The account
  tab bar signals the active tab by colour (`text-primary` plus a border) and is specified to mirror the
  staff `PanelNav`; coloured glyphs would compete with that. Staff colour badges are a later slice.
- **The Quick Shop hub (`app/(storefront)/quick-shop/page.tsx`)** is superseded by `#1195` (three tabs
  under `/account`), so colouring it now would be thrown away.
- Checkout, forms, header, footer, contact-channel glyphs, star ratings, favourite heart: functional.
  The two hand-rolled brand glyph files (`contact-channel-icons.tsx`, `ReferralCard.tsx`) are unchanged.
- **Larger Just Eat-style overflowing tiles.** P4a keeps the strip's 64 pixel tile geometry (so the
  scroller's arrow offsets and the page layout do not move) and fits a 48 pixel illustration inside it.
  A bigger tile is a layout decision for the owner after seeing P4a live.
- **AI-generated per-vendor illustrations** are `#1224`, gated on an experiment and a schema change.
- **Removing `lucide-react` (Phase 5)** is optional and not done here: the parity test needs it
  (R26). **Derived `--color-icon-1..4` tokens** are not added. **A public credits page** is not added;
  the licence text ships as a static file (R27, R28) and a footer link is the owner's call.
- Long-cache hashed filenames for illustration files, and WebP/PNG variants: not needed at 71 KB.

## Risks the requirements are written against

| Risk | Where it is pinned |
| --- | --- |
| Hollow stars and hearts (root `fill` class cannot reach children) | R13 |
| A "no visual change" migration that quietly changes sizes or geometry | R26, R31, R34, R35 |
| A provider id leaking into component code, defeating the abstraction | R15, R16, R32 |
| Unsafe markup in generated bodies (they are injected unescaped) | R10 |
| A stale generated file reaching a deploy | R8, R9 |
| Vendor colours not reaching icons (the #251 shape) | R39, R40 |
| Bundle growth from bodies shipped in client components | R37 |
| Grocery pictures on a non-grocery vendor | R49, R51 |
| New runtime network dependency or CSP widening | R50 |

## Open items carried forward

- **Credits page (owner).** Whether a footer link to `/third-party-icon-licenses.txt` is wanted is
  undecided; this slice ships the file only. Tracked on `#1223`.
- **Model.** `CLAUDE.md` assigns Spec and Build to Opus 5; this spec was written on Sonnet 5.5 at the
  owner's `/spec` instruction. Build should run on Opus 5 once the owner switches.
- **`#1224`** (AI illustrations) and **`#1195`** (Quick Shop re-homing, which also changes `AccountNav`).
- **Unverified at spec time:** client and Worker bundle baselines (recorded at Build start, R37); whether
  Lucide's Iconify data and the installed `lucide-react` differ in any icon's geometry (R26 finds out and
  records every divergence); real-browser appearance of the two-hue glyphs in the app itself (only a
  static preview sheet was seen).
