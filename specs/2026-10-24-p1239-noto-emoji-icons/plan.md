---
id: p1239-noto-emoji-icons-plan
title: "Colourful Noto Emoji icons across storefront and admin surfaces (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: Switch all 79 decorative and status icons in ICON_REGISTRY to colourful Noto Emoji SVGs with per-icon gradient ID namespacing, keeping 31 functional UI controls and rating stars on Lucide. Issue 1239.
tags: [icons, design-system, noto-emoji, iconify, accessibility, multi-tenancy]
related: [adr-008-icon-system, icon-system-plan, design-system, tech-stack]
---

# Colourful Noto Emoji icons across storefront and admin surfaces (plan)

Issue `#1239`, approved by the owner at Gate 1 on 2026-10-24. Builds on `specs/2026-10-22-icon-system/plan.md` and `specs/decisions/ADR-008-icon-system.md`.

**Goal:** update the storefront and `/staff/*` admin surfaces to use colourful **Google Noto Emoji** (`@iconify-json/noto`, Apache-2.0) inline SVGs for all feature, button, navigation, sidebar (`CollectionNav`), header (`Delivery` / `Click & Collect`, `Quick Shop`, `Shop`, `ViewSwitcher`, top promo bar), rewards (`RewardsLauncher`, `RewardsPanel`), trust strip, account (`AccountNav`), footer, status (`badge-check`, `circle-alert`, `circle-check`, `circle-x`, `shield-alert`, `triangle-alert`), and admin icons, while keeping compact functional UI chrome (`chevron-*`, `arrow-*`, `x`, `plus`, `minus`, `check`, `loader-circle`, `eye`, `eye-off`, `sliders-horizontal`, `panel-left-*`, `copy`, `download`, `external-link`, `play`, `pause`, `repeat`, `rotate-ccw`, `save`, `ban`, `bookmark-plus`, `log-in`, `log-out`, `search`, `share`) and interactive 1-to-5 rating stars (`star`) on Lucide (`currentColor`).

## Why Phases 1 to 4a left button and sidebar icons monochrome

`#1223` (Phases 1 to 4a, merged to `staging` in PRs `#1225`, `#1229`, `#1232`, and `#1238`) built the provider-agnostic `<Icon>` component (`components/icons/Icon.tsx`), the semantic registry (`components/icons/registry.ts`), and the build-time generator (`scripts/lib/icon-build.ts`). However, Phase 3 (`#1238`) only switched 9 keys (`trust-*` and `rewards-*`) to Phosphor duotone and added 16 static department illustrations (`public/icons/departments/<slug>.svg`). The remaining 99 registry keys stayed on `provider: "lucide"`, so header fulfilment pills (`truck`, `store`), sidebar navigation (`sparkles`, `tag`, `bookmark`, `repeat`), account links, buttons (`pencil`, `trash`, `lock`), status badges, and admin navigation still rendered monochrome Lucide strokes on staging.

When reviewing `staging.aheedfoodcentre.nocaped.com/categories/dairy-eggs`, the owner requested that all decorative, feature, button, navigation, sidebar, rewards, account, footer, status, and staff/admin icons use colourful **Noto Emoji** across the entire website, with three explicit design decisions resolved at Gate 1:

1. **Provider & Tier Scope:**
   - All **79** `decorative` and `status` keys in `ICON_REGISTRY` (73 `decorative` + 6 `status`, including `trust-*`, `rewards-*`, `circle-question-mark`, `lock`, `pencil`, and `trash`) use `provider: "noto"`.
   - **30** `functional` UI chrome primitives plus **1** interactive rating `star` key (`StarRatingInput.tsx` and product review star ratings, which rely on `fill="none"` vs `fill-amber-400`) remain on `provider: "lucide"`.
   - Sidebar `"Featured Products"` in `components/product/CollectionNav.tsx` uses a dedicated decorative key `featured-star` (`glowing-star` in Noto Emoji) so rating stars (`star`) stay untouched.
2. **Product Card Favourite Heart (`components/product/FavouriteButton.tsx`):**
   - Unfavourited products (`displayed === "off"` and `displayed === "signed-out"`) render `heart-outline` (Noto Emoji `white-heart`).
   - Favourited products (`displayed === "on"`) render `heart` (Noto Emoji `red-heart`).
3. **Header Search Button (`components/layout/Header.tsx`):**
   - Keeps the white outline magnifying glass (`search`, `provider: "lucide"`) on the dark primary search button for contrast.

## Technical Design

### 1. Extending `IconProvider` and `scripts/lib/icon-build.ts` for inline Noto Emoji

- **`components/icons/types.ts`:** Widen `IconProvider` from `"lucide" | "ph"` to `"lucide" | "ph" | "noto"`. Keep the `RegistryEntry` discriminated union so `tier: "functional"` still requires `provider: "lucide"` at compile time.
- **Root SVG attributes (`NOTO_ROOT = {}`):** Unlike Lucide (`fill="none" stroke="currentColor"`) or Phosphor (`fill="currentColor"`), Noto Emoji SVGs carry multi-colour `fill` attributes on individual `<path>`, `<circle>`, and `<radialGradient>` / `<linearGradient>` elements. Hoisting or setting `fill="currentColor"` on `<svg>` would clobber any child path without an explicit `fill` attribute. For `provider === "noto"`, `root` in `GENERATED_ICONS` is `{}` and attribute hoisting is skipped.
- **SVG Internal ID Namespacing (`namespaceNotoSvgIds`):**
  77 of the first 200 glyphs in `@iconify-json/noto/icons.json` define internal `<linearGradient>`, `<radialGradient>`, or `<clipPath>` elements with generic sequential IDs (`id="svgIDa"`, `id="svgIDb"`, etc.) referenced via `url(#svgIDa)`, `href="#svgIDa"`, or `xlink:href="#svgIDa"`. When multiple inline `<svg>` elements appear in the same document, duplicate DOM `id` attributes cause later icons to sample the first icon's gradient or clip path.
  In `scripts/lib/icon-build.ts`, for every `provider === "noto"` registry entry with semantic name `<name>`, rewrite:
  - `id="<id>"` -> `id="ni-<name>-<id>"`
  - `url(#<id>)` -> `url(#ni-<name>-<id>)`
  - `href="#<id>"` -> `href="#ni-<name>-<id>"`
  - `xlink:href="#<id>"` -> `xlink:href="#ni-<name>-<id>"`
- **Licence Deduplication in `buildLicences`:**
  Both `ICON_REGISTRY` (`provider: "noto"`) and `DEPARTMENT_ILLUSTRATIONS` (`ILLUSTRATION_SET = "noto"`) now reference `@iconify-json/noto`. `buildLicences` in `scripts/lib/icon-build.ts` must deduplicate `sets` *after* appending `ILLUSTRATION_SET` so `@iconify-json/noto` (`Apache-2.0`) is emitted once in `public/third-party-icon-licenses.txt`.

### 2. Complete Registry Mapping (110 Keys: 79 Noto Emoji + 31 Lucide)

#### 79 Noto Emoji Keys (`provider: "noto"`)

| Semantic Key | Tier | Noto Emoji ID | Primary Surfaces |
| --- | --- | --- | --- |
| `apple` | `decorative` | `red-apple` | Category fallback (`fruit-veg`) |
| `badge-check` | `status` | `check-mark-button` | Verified badges, staff status |
| `banknote` | `decorative` | `dollar-banknote` | Payment / pricing |
| `beef` | `decorative` | `cut-of-meat` | Category fallback (`meat-poultry`) |
| `bell-ring` | `decorative` | `bell` | Back-in-stock & order alerts |
| `book-a` | `decorative` | `blue-book` | Admin glossary / runbook |
| `book-open` | `decorative` | `open-book` | Admin runbook / guides |
| `bookmark` | `decorative` | `bookmark` | Saved lists (`CollectionNav`, `Header`) |
| `boxes` | `decorative` | `package` | Bundles & multi-packs |
| `bug` | `decorative` | `bug` | Diagnostics / debug |
| `calendar-clock` | `decorative` | `tear-off-calendar` | Delivery slots & schedules |
| `circle-alert` | `status` | `exclamation-mark` | Validation & inline alerts |
| `circle-check` | `status` | `check-mark-button` | Success confirmations |
| `circle-question-mark` | `decorative` | `red-question-mark` | Header Help Guide & tooltips |
| `circle-user-round` | `decorative` | `bust-in-silhouette` | Account header & profile |
| `circle-x` | `status` | `cross-mark-button` | Error states & failed checks |
| `clipboard-list` | `decorative` | `clipboard` | Shopping lists & order summaries |
| `clock` | `decorative` | `three-oclock` | Delivery cutoffs & opening hours |
| `coffee` | `decorative` | `hot-beverage` | Category fallback (`drinks`, `tea-coffee`) |
| `coins` | `decorative` | `coin` | Loyalty points & credit |
| `contact` | `decorative` | `identification-card` | Customer contact details |
| `cookie` | `decorative` | `cookie` | Snacks & cookie preferences |
| `credit-card` | `decorative` | `credit-card` | Checkout payment methods |
| `croissant` | `decorative` | `croissant` | Category fallback (`bakery`) |
| `featured-star` | `decorative` | `glowing-star` | Sidebar `"Featured Products"` (`CollectionNav`) |
| `folder-tree` | `decorative` | `card-index-dividers` | Admin categories |
| `gauge` | `decorative` | `stopwatch` | Admin performance / metrics |
| `gift` | `decorative` | `wrapped-gift` | Rewards & referral gifts |
| `globe` | `decorative` | `globe-showing-americas` | Storefront domain / international |
| `heart` | `decorative` | `red-heart` | Active `FavouriteButton`, Favourites nav & cards |
| `heart-outline` | `decorative` | `white-heart` | Inactive / signed-out `FavouriteButton` |
| `house` | `decorative` | `house` | Home breadcrumb & address |
| `image-up` | `decorative` | `framed-picture` | Admin image uploaders |
| `layers` | `decorative` | `books` | Category hierarchy / batches |
| `layout-dashboard` | `decorative` | `bar-chart` | Admin dashboard |
| `list-checks` | `decorative` | `memo` | Shop your list (`Header`) |
| `lock` | `decorative` | `locked` | Checkout security & password fields |
| `mail` | `decorative` | `envelope` | Email contact & notifications |
| `map-pin` | `decorative` | `round-pushpin` | Postcode & store address |
| `megaphone` | `decorative` | `megaphone` | Promotions & campaigns |
| `message-circle` | `decorative` | `speech-balloon` | WhatsApp & live chat |
| `message-square-quote` | `decorative` | `thought-balloon` | Customer reviews & notes |
| `messages-square` | `decorative` | `speech-balloon` | WhatsApp community & support |
| `milk` | `decorative` | `glass-of-milk` | Category fallback (`dairy-eggs`) |
| `navigation` | `decorative` | `compass` | Store directions |
| `package` | `decorative` | `package` | Orders & products |
| `package-open` | `decorative` | `package` | Empty / unpacked order states |
| `package-x` | `decorative` | `package` | Out-of-stock / cancelled items |
| `pencil` | `decorative` | `pencil` | Edit actions across storefront & admin |
| `percent` | `decorative` | `hundred-points` | Percentage discounts |
| `phone` | `decorative` | `telephone-receiver` | Store phone contact |
| `rewards-bag` | `decorative` | `shopping-bags` | Rewards earn: place an order |
| `rewards-coins` | `decorative` | `coin` | Rewards balance & points |
| `rewards-discount` | `decorative` | `label` | Rewards vouchers & discounts |
| `rewards-gift` | `decorative` | `wrapped-gift` | Rewards launcher & welcome gift |
| `rewards-invite` | `decorative` | `people-hugging` | Rewards referral |
| `rewards-sparkles` | `decorative` | `sparkles` | Rewards highlights |
| `ruler` | `decorative` | `straight-ruler` | Unit measurements & weights |
| `shield` | `decorative` | `shield` | Security & privacy |
| `shield-alert` | `status` | `warning` | Security warnings |
| `shield-check` | `decorative` | `shield` | Verified checkout security |
| `shopping-bag` | `decorative` | `shopping-bags` | Header Cart button & Shop menu |
| `sparkles` | `decorative` | `sparkles` | Quick Shop (`Header`), New Arrivals (`CollectionNav`) |
| `store` | `decorative` | `convenience-store` | Click & Collect pill (`Header`), store info |
| `tag` | `decorative` | `label` | Price Match, Offers (`CollectionNav`), tags |
| `ticket-percent` | `decorative` | `admission-tickets` | Promo codes & vouchers |
| `timer` | `decorative` | `hourglass-not-done` | Reservation & slot countdowns |
| `trash` | `decorative` | `wastebasket` | Delete / remove buttons |
| `trending-up` | `decorative` | `chart-increasing` | Best Sellers (`CollectionNav`), analytics |
| `triangle-alert` | `status` | `warning` | Warning banners & stock alerts |
| `truck` | `decorative` | `delivery-truck` | Delivery pill (`Header`), shipping |
| `trust-delivery` | `decorative` | `delivery-truck` | Landing trust strip: delivery |
| `trust-payment` | `decorative` | `credit-card` | Landing trust strip: payment |
| `trust-updates` | `decorative` | `bell` | Landing trust strip: updates |
| `user` | `decorative` | `bust-in-silhouette` | Sign In (`Header`), account profile |
| `user-check` | `decorative` | `bust-in-silhouette` | Active customer / staff |
| `user-plus` | `decorative` | `busts-in-silhouette` | Register (`Header`), invite |
| `user-x` | `decorative` | `bust-in-silhouette` | Deactivated / guest user |
| `users` | `decorative` | `busts-in-silhouette` | Staff users & customer groups |

#### 31 Lucide Keys Kept (`provider: "lucide"`)

- **30 `functional` UI controls:** `arrow-left`, `arrow-right`, `ban`, `bookmark-plus`, `check`, `chevron-down`, `chevron-left`, `chevron-right`, `chevron-up`, `copy`, `download`, `external-link`, `eye`, `eye-off`, `loader-circle`, `log-in`, `log-out`, `minus`, `panel-left-close`, `panel-left-open`, `pause`, `play`, `plus`, `repeat`, `rotate-ccw`, `save`, `search`, `share`, `sliders-horizontal`, `x`.
- **1 `decorative` rating glyph:** `star` (kept on `lucide` so `StarRatingInput.tsx` and product review star ratings continue to toggle `fill="none"` vs `fill-amber-400` cleanly).

### 3. Bundle Size & Performance

- All 79 Noto Emoji SVG bodies total ~248 KB raw (before gzip/brotli) in `components/icons/generated/icon-data.ts`, with zero runtime network requests (`connect-src 'self'` CSP preserved).
- Only the 79 referenced glyphs are extracted at build time from `@iconify-json/noto/icons.json` (which remains in `devDependencies`).

### 4. Roadmap Audit Reconciliation

- Carry forward the missing promotion row in `specs/roadmap.md` for **PR #1237 (`71fced7`)** (which promoted `#1211`, `#1216`, `#1223` P1-2b, `#1231`, and `#1233` to `main`) and update `docs/model-handoff.md` so `npm run sdd:audit` reports 0 unrecorded promotions.
