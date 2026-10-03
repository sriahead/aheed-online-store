---
id: p960-962-mobile-browse-density-plan
title: "#960, #961, #962 — Mobile browse density (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-02
visibility: internal
summary: Gives more of a phone screen to products. Only the logo, nav and search row stays sticky, the card and header controls reach 44px below lg, and one shared ProductGrid replaces three hardcoded grids. It uses even columns and a per-vendor density preset (one additive enum column).
tags: [storefront, mobile, accessibility, layout, design-system, staff-panel, p10]
related: [design-system, architecture, discovery-log]
---

# #960, #961, #962 — Mobile browse density (plan)

The seventh Discover pass (`docs/research/discovery-log.md`, 2026-10-02) measured the storefront's
mobile layout and filed three findings that all decide **how many products fit on a phone screen**:

- **#960:** the header is 232px and sticky.
- **#961:** the most-tapped controls are 24–32px.
- **#962:** the grid has a 3-column step that ragged-rows short pages.

They trade off against each other. Bigger controls make taller cards, and a shorter header buys
that back, so they are built and measured together. The owner approved this grouping and chose
vendor density presets over even-columns-only at `/propose` (2026-10-02).

**Goal:**

- A shopper scrolling a category on a phone keeps only one compact row of chrome on screen.
- Every control they tap to add or change a quantity is at least 44×44 CSS px.
- Every product listing renders through one grid whose column steps are even (or one column), and
  each vendor chooses that grid's density.

## Scope (this slice)

### 1. Header split (#960)

`components/layout/Header.tsx` today renders one `<header className="sticky top-0 …">`. That
header holds three rows:

1. The trust banner.
2. The logo/nav row (LocationControl and search inline from `sm`).
3. A below-`sm` row with `LocationControl` and the search form.

An inner element cannot be made sticky on its own. A `position: sticky` element sticks only
within its parent's box, so a sticky row inside a non-sticky `<header>` scrolls away with the
header. The component therefore returns **three siblings** (a fragment). Their parent is
`StorefrontChrome`'s / the admin layout's full-height `flex-col` div, so the sticky one sticks for
the whole page:

1. **Banner `<div>`:** not sticky, scrolls away.
2. **`<header>` element, `sticky top-0 z-40`:** holds the logo/nav row and, below `sm`, the
   search form. This is the one `banner` landmark.
3. **Below-`sm` location `<div>`:** holds `LocationControl`. Not sticky, scrolls away. It renders
   after the search row, so the mobile order becomes search above location. Only the location
   control moves.

Nothing else moves:

- From `sm` the location control and search stay inline in the sticky row, as today.
- The portal (`isPortal`) renders the same way. Its banner simply scrolls away too.
- The floating cart button (`CartDrawerShell`, `fixed bottom-6 right-6`) is already outside the
  header flow and is untouched.

**#329's header-jerk fix stays.** The logo's `aspect-9/5` reservation and its `h-10 overflow-clip`
container must survive the restructure (R4).

The alternative is `display: contents` on an outer `<header>`, which would keep one landmark
around all three rows. It was rejected: `display: contents` has a history of dropping element
semantics in shipped browsers. Compact-on-scroll was also rejected, because it needs client
JavaScript in a server-only header.

### 2. Touch targets (#961)

The new token `--spacing-tap: 2.75rem` (44px) goes in `design-system/tokens/tokens.css`'s `@theme`
block. It generates `h-tap`, `w-tap`, `size-tap`, `min-h-tap` and `min-w-tap` utilities.

Each control below uses the token for its height (and width, where it is icon-only) **below
`lg`**. From `lg` it keeps today's size, as the owner was told at `/propose` ("desktop sizes stay
as they are"):

- The `ProductCard` "Add" button (`AddToCartButton` `variant="card"`).
- The in-cart stepper's minus and plus (`CartQuantityStepper`).
- The mobile Quick View button (`ProductCard`, the `sm:hidden` eye button).
- The header's Shop, Shop List, Sign In and Account links.

Why `lg` and not `sm`: a 640–1023px viewport is a tablet, which is a touch device too.

**One consequence the spec decides now rather than leaving to the build.** At 360–390px a 2-column
card has about 128px of content width. That cannot hold a 44px minus, a quantity, a 44px plus
**and** an Add button on one row. So **below `sm`** the card's pre-add quantity picker
(`AddToCartButton` card variant's minus/qty/plus) is hidden, and the card shows Add alone:

- One tap adds one item.
- The in-cart `CartQuantityStepper` then replaces Add on that card (`#345`'s existing behaviour)
  and carries the 44px minus/plus.
- From `sm` the pre-add picker shows exactly as today, now with 44px controls below `lg`.

This is how mainstream grocery apps work, and it lowers card height, which is what #960's
saving is for.

The in-cart stepper is the tight fit. At 360px its two 44px buttons, the quantity readout, the
gaps and the `p-1` frame come to about 122px against 128px of card content. That holds only if the
stepper's internal gap shrinks (e.g. `gap-1.5` → `gap-1`). R8 measures it at 390px, and the build
should also check 360px.

`pointer-coarse:` was considered instead of a width breakpoint. It was rejected because no tool
available to validation can emulate a coarse pointer, so the result could not be measured.

### 3. Shared grid with vendor density (#962)

**`lib/product-grid-density.ts`** is a new, plain module (not `"use server"`), DB-free and
unit-tested. It holds:

- the ordered list of presets;
- each preset's static class string (Tailwind cannot build `grid-cols-*` from runtime values, so
  every string is a literal);
- each preset's staff-facing label and description;
- `parseProductGridDensity(value)` (unknown → error);
- the form-state type and initial state.

**`components/product/ProductGrid.tsx`** is a new server component: `ProductGrid({ density, as,
children })`, with `as` either `"div"` (default) or `"ul"` (bundles renders `<li>` cards). It is
the only grid markup for product listings. The three call sites switch to it:

- `app/(storefront)/categories/[slug]/page.tsx`
- `app/(storefront)/search/page.tsx`
- `app/(storefront)/bundles/page.tsx`

| Preset | Below `sm` | `sm` | `md` | `lg` | `xl` | Class string |
|---|---|---|---|---|---|---|
| `COMPACT` | 2 | 2 | 2 | 4 | 6 | `grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6` |
| `STANDARD` (default) | 2 | 2 | 2 | 4 | 4 | `grid grid-cols-2 gap-4 lg:grid-cols-4` |
| `SPACIOUS` | 1 | 2 | 2 | 2 | 4 | `grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4` |

Why these values:

- **Every multi-column step is even.** One column cannot produce a ragged row.
- **Four columns never start at `md`.** `FilterPanel`'s 240px sidebar from `md` leaves about 500px,
  so four cards would be about 110px wide (the discovery log's arithmetic).
- **Six columns start only at `xl`.** That is about 984px of grid beside the sidebar inside
  `max-w-7xl`, roughly 150px per card.
- **`STANDARD` is what every vendor gets with no action.** It differs from today only by dropping
  `sm:grid-cols-3`.
- A free per-vendor column count stays rejected (discovery log): it allows layouts that break the
  card.

**Data and staff control:**

- **Data:** a new enum `ProductGridDensity { COMPACT STANDARD SPACIOUS }` and a column
  `VendorConfig.productGridDensity ProductGridDensity @default(STANDARD)`.
  - `VendorConfig`, not `VendorTheme`: `VendorTheme` is a vendor's **saved colour themes**
    (many rows per vendor), not a per-vendor setting. `VendorConfig` already holds the per-vendor
    storefront presentation settings (`searchPlaceholder`, `bannerNote`, the `#905` label
    switches).
  - It is one additive migration: a new type plus a column with a default. It is generated with
    `--create-only` and read before it applies, and it must not drop the `pg_trgm` indexes.
- **Read path:**
  - `fetchVendorProfile` selects the column, and `VendorProfile` gains `productGridDensity`
    (`STANDARD` when no config row resolves).
  - The three pages read it through the request-memoised `getCurrentVendorProfile()`.
- **Write path:**
  - A new server action `updateProductGridDensity` in `features/admin/storefront.ts`. It requires
    `requireVendorRole("ADMIN")`, takes the vendor from the session, and writes through
    `updateVendorStorefrontConfig` (extended with the optional field).
  - It revalidates `/staff/storefront` and `/` layout.
  - It is its own form, for the same reason `updateCatalogueSettings` is: every other storefront
    form must keep leaving this field alone.
- **Staff UI:**
  - A new "Product grid layout" section in `components/staff/StorefrontConfigForm.tsx` offers the
    three presets as a radio group. Each option carries its label and a vendor-neutral
    description: no grocery or vendor names, per the user-facing-copy rule.
  - It adds no new `/staff/*` page, so the three-surface rule does not apply.
- **Guide:** `docs/store-admin-guide/admin-tabs-guide.md`'s Storefront section gains a paragraph.
  It describes the three presets and where a shopper sees the change.

### 4. Measuring at real phone widths: `scripts/verify-mobile-layout.ts`

Desktop Chrome cannot be narrower than 501px. A same-origin iframe of a set width does not work
either: `next.config.mjs` sends `X-Frame-Options` and `frame-ancestors 'none'`, which this slice
does not weaken.

**What does work, and was proven at Spec time against production (2026-10-02):** headless Chrome
driven over the DevTools protocol with `Emulation.setDeviceMetricsOverride`. It uses Node 22's
built-in `WebSocket` and the locally installed Chrome, with no new dependency. Its baseline
readings on `aheedfoodcentre.nocaped.com/categories/fruit-veg`, before this slice:

| Viewport | `header` height | First card top (y) | Card Add button (w × h) |
|---|---|---|---|
| 360×844 | 234px | 804px | 45×32 |
| 390×844 | 234px | 760px | 59×32 |

The slice commits that instrument as `scripts/verify-mobile-layout.ts`, following the existing
`scripts/verify-*.ts` convention:

- It is a **measuring instrument, not a judge**. It prints the raw numbers as JSON, and
  `requirements.md` holds the thresholds. That way a post-Clear validator compares numbers rather
  than trusting a script's own PASS line.
- To make the measured elements unambiguous, the markup gains three stable attributes:
  `data-header-banner`, `data-header-location` and `data-product-grid`.
- This is the first piece of real-width measurement the repo has. It does not replace `#440`'s
  Playwright harness.

### 5. Persistent doc

`specs/design-system.md` records two standing rules:

- the `tap` token and the 44px-below-`lg` rule;
- that product listings render only through `ProductGrid`, with the even-column rule and the
  preset table.

## Deliberately excluded

- **#956 (honest add-to-cart):** the card variant ignoring its `label` prop, the false "Added", and
  the missing live region. This slice resizes `AddToCartButton` but does not change its accessible
  name, its action contract or its feedback. #956 builds on the resized button next.
- **#958 and #959 (mobile checkout):** these are slice 2.
- **#955 (crawlability) and #957 (reorder notices):** they are not layout issues and stay in
  Backlog.
- **Every other control under 44px.** The discovery pass counted 62 of 79. This slice fixes only
  the ones named in #961's measurements (card Add, both steppers, mobile Quick View, header
  Shop/Shop List/Sign In/Account). `LocationControl`, filter chips, subcategory tabs, pagination
  links, the cart drawer's own controls and staff pages are not touched. A follow-up can adopt the
  `tap` token there.
- **The product detail page's `variant="full"` button and Quick View's `variant="drawer"`
  controls.** They are already 44px (`py-3`/`h-11`) or outside the grid.
- **Compact-on-scroll header, bottom navigation (#395), a shopper-side grid/list toggle.** The
  first needs client JS. The other two were challenged or deferred to analytics (`#607`) by the
  discovery pass.
- **Homepage product rails and any other product list** (e.g. `ProductRow`, Shop Your List). They do
  not use the hardcoded grid today and are untouched.
- **Seeding a non-default preset for any vendor.** Both vendors stay `STANDARD` after migration.
  Validation sets SriMart's preset through the real staff control.
- **Measuring on real devices.** Validation measures emulated 360/390/768/1100/1280px viewports in
  headless Chrome under `npm run preview` (section 4). A real-device pass is `#440`'s Playwright
  harness, not this slice.

## Open items carried forward

- The `tap` token's adoption beyond these controls, for the remaining 50-odd sub-44px controls.
  This becomes a follow-up issue filed at `/build-notes` if the build confirms the token works as
  specified.
- #956, #958 and #959 are queued behind this slice.
