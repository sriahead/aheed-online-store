---
id: p979-655-storefront-finish-plan
title: "#979, #655 — Storefront finish: remaining tap targets and image fallbacks (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-04
visibility: internal
summary: The storefront controls #964 left out get a 44px hit area below lg, with desktop unchanged and no density cost. Every storefront image of a stored object degrades to its no-image look when the object fails to load, not to a broken-image icon.
tags: [storefront, mobile, accessibility, touch-targets, images, p10]
related: [design-system, p964-966-968-mobile-tap-targets-plan, runtime-pitfalls, discovery-log]
---

# #979, #655 — Storefront finish: remaining tap targets and image fallbacks (plan)

Slice 5 of the mobile programme that came out of the seventh Discover pass
(`docs/research/discovery-log.md`, 2026-10-02). Slices 1–4 are on `staging`, and 1–3 are in
production. The owner approved this bundle at `/propose` on 2026-10-04, recorded as a comment on
`#979` and `#655`. Slice 6 (`#973`/`#957`/`#753`/`#972`) and slice 7 (`#955`) follow it.

**Goal:** nothing a shopper taps on a phone is under 44×44 CSS px on the surfaces `#964` left out,
and no storefront page shows a broken-image icon when a stored image is missing. Both are
component-level fixes with no schema, server or copy change.

The two issues share one instrument (`scripts/verify-mobile-layout.ts`), one validation setup
(`npm run preview` and headless Chrome), and several files (`CartContents`, `QuickViewDrawer`'s
gallery). That is why they are one slice.

## 1. Facts found while writing this spec

These correct `#979`'s and `#655`'s own text. A validator should trust this section over the issue
bodies.

- **The header search form has no submit control.** `components/layout/Header.tsx`'s `SearchForm`
  holds only `SearchSuggest`'s input (`components/layout/SearchSuggest.tsx`). Enter submits it, and
  the suggestion list navigates. The control in scope is the **input** itself: `py-2 text-sm`,
  about 38px tall.
- **The "homepage" scroller arrows are on `/categories`, not `/`.** `ProductRow` and `BundleRow`
  render only in `app/(storefront)/categories/page.tsx`. The landing page (`/`) renders no
  `HorizontalScroller` at all. That is why `#964`'s Validate found no `scroller-arrow` on `/`.
  This slice measures them on `/categories`.
- **The department arrow's placement is a number, not a judgment.** Before `#964` the arrow was a
  32px circle at `top-8`, so its centre sat 48px below the row's top. `#964` set the 44px button to
  `top-6.5` (26 + 22 = 48). The check is that the circle's centre is the same distance below the row
  top at 390px as at 1280px. No screenshot is needed.
- **Quick View has no image fallback either.** `QuickViewDrawer.tsx` renders `ProductImageGallery`
  with `variant="carousel"`. It does not use `ProductImage`. `ProductCard` is the only surface that
  falls back today.
- **The header logo is the same failure class.** `Header.tsx` renders the vendor logo from a
  storage key as a bare `<img>`, on every page. `#655` did not list it. It is included because the
  mechanism is identical, and leaving it out would make the live check below unable to say
  "no broken image on this page".
- **The filter panel's checkboxes are hit through their labels.** `ProductFilterForm` wraps each
  checkbox in its `<label>`, so the label's box is the tap area. The script currently measures the
  13px box itself, so it gains a rule for that (R2).

## 2. Scope

### #979 — the remaining tap targets

Same rule as `#964` (`specs/design-system.md`, "Touch targets"): **below `lg`** each control is at
least 44px in each direction; **from `lg`** it keeps today's size exactly. A small visual keeps its
size inside a larger button. New `data-tap-surface` hooks:

| Surface | File | Controls | Today (from classes) |
|---|---|---|---|
| `search` | `components/layout/SearchSuggest.tsx` | the header search input | `py-2 text-sm`, about 38px tall |
| `filter-form` | `components/product/ProductFilterForm.tsx`, on the `<form>` | every input, select, checkbox label and the Apply button | inputs and selects about 40px; checkbox labels about 20px; Apply about 40px |
| `cart-drawer-close` | `components/cart/CartDrawerShell.tsx` | the drawer's close button | `p-1.5` around a 20px icon, 32px |
| `quick-view-close` | `components/product/QuickViewDrawer.tsx` | Quick View's close button | 32px, same as above |
| `gallery-arrow` | `components/product/ProductImageGallery.tsx` | the carousel's previous and next arrows | `h-8 w-8`, 32px |
| `quick-view-add` | `components/cart/AddToCartButton.tsx`, the `drawer` variant's wrapper | the pre-add minus and plus, and Add | minus and plus `px-3` around a 16px icon in an `h-11` row, about 40×44 |

The existing `scroller-arrow` surface needs no class change. It is measured on `/categories` for the
first time (product, bundle and department rows), and the department arrow's placement is checked
(section 1).

**No density cost.** `#964`'s R11 left only 4px between Aheed's first product card and its cap. On a
phone, the search input sits in its own header row (`Header.tsx`, `px-4 pb-3 sm:hidden`), so a 6px
taller input would push the product grid down 6px. Build takes the same height back from that row's
padding (or equivalent), so the first card does not move at all (R11). From `sm` the search sits
inside the main header row, which is already 44px tall because of the `tap`-sized buttons beside it.

The filter form renders twice, in the mobile `<details>` and in the `md`+ sidebar. One class change
covers both. Between `md` and `lg` the sidebar copy grows too, which matches the "below `lg`" rule.
The mobile panel is closed by default, so its growth does not move the product grid.

### #655 — image fallbacks

`components/product/ProductImage.tsx` already does the right thing for product cards (`#502`). It
renders the image, and on `onError` swaps in the no-image look. This slice extracts that behaviour
into `components/ui/ImageWithFallback.tsx`. It is a client component that takes the usual `<img>`
attributes plus a required `fallback` node. `ProductImage` keeps its exact API and output on top of
it, so `tests/product-card-image.test.tsx` passes unchanged.

Every storefront `<img>` of a stored object then renders through it. Each surface's fallback is that
surface's own existing no-image branch, so a missing object looks exactly like no image:

| Surface | File | Fallback |
|---|---|---|
| Product page and Quick View gallery (both variants) | `components/product/ProductImageGallery.tsx` | the gallery's grey box for that slot |
| Cart line, drawer and `/cart` | `components/cart/CartContents.tsx` | the existing `h-16 w-16` grey box |
| Bundle card | `components/bundle/BundleCard.tsx` | the existing `Package` icon box |
| Department hero, campaign photo | `components/layout/DepartmentHero.tsx` | nothing; the panel's colour and the scrim stay, so the white text stays legible |
| Department hero, corner thumbnail | same file | the department's icon, as the no-image branch renders |
| Header logo | `components/layout/Header.tsx` | the existing initial-letter tile and name |

**The hydration race is a real risk, and the live check is designed to catch it.** If an image fails
before React hydrates, the `error` event has already fired, and `onError` may never run. The live
check blocks the CDN at the network layer, so images fail almost at once, almost certainly before
hydration. If Build's baseline shows `ProductCard` itself broken under that check, the race is real
for `#502`'s fallback too. The fix (for example, on mount, treat `complete && naturalWidth === 0` as
failed) goes into `ImageWithFallback` and so covers every surface. The baseline decides; this plan
does not guess.

## 3. Measuring, and the baseline

The instrument is `scripts/verify-mobile-layout.ts`. This slice adds (R1–R6):

- `--open-filters`, `--open-cart` and `--open-quick-view`, which open the mobile filter panel, the
  cart drawer and the first card's Quick View before measuring;
- `--block-urls <pattern>`, which blocks matching requests through the DevTools protocol, forces
  every image to load eagerly, and reports `brokenImages`;
- `select` in `tapTargets`, and the label's box for a checkbox or radio inside a label;
- `scrollerArrows`, the vertical offset of each arrow's visible circle within its row.

**Build order, as in `#964`:** the hooks and script changes land first with **no class or component
change**. Build then runs every run in `requirements.md` and stores the raw output in this folder's
`baseline/`. Only then does it change sizes and images. The image runs' baseline must show broken
images, which proves the block works and reaches each surface. Without it, an empty `brokenImages`
afterwards would prove nothing.

## 4. Deliberately excluded

- **The gallery's dot buttons.** They are 6px tall. The arrows and swiping do the same job, which is
  SC 2.5.5's "equivalent" exception. Making five dots 44px tall would mean redesigning the
  indicator, which is not a sizing fix.
- **Quick View's body controls**: the review form's Submit, Delete, the error state's Try again, and
  the Log in link. They are under 44px, but neither issue names them, and the review form is its own
  surface. They are tracked in `#981`, filed at spec approval. **The drawer's add-to-cart
  minus and plus are in scope, not in that list** (`quick-view-add`). `#961` sized the `card`
  variant of `AddToCartButton`, but the `drawer` variant Quick View uses has `px-3` buttons about
  40px wide, found while writing this spec.
- **The floating cart button and the floating contact trigger.** Both already measure 44px or more
  from their classes (`px-4 py-3` with a 20px icon).
- **Staff panel images and controls.** Both issues are storefront-only. Staff image previews are
  outside `#655`.
- **Repairing missing objects in a bucket.** This slice changes how a missing object looks, not
  whether it exists. `docs/developer-portal/runtime-pitfalls.md` keeps the CDN check for that.
- **`next/image`.** `#46` settled on plain `<img>` (no Image Transformations on the zone).
  `ImageWithFallback` is a plain `<img>` too.
- **`pointer-coarse:`**, for the reason `#961` recorded: no tool available to validation can emulate
  it.
- **Slice 6 and 7 issues** (`#973`, `#957`, `#753`, `#972`, `#955`), and `#665`'s primitive
  adoption.

## 5. Open items carried forward

- **Real devices** (iOS Safari, Android Chrome) are post-deploy evidence, as in slices 1–4, with no
  issue.
- **Dev data may not exercise every image surface.** If Aheed's dev catalogue has no campaign photo,
  department image or product with two or more images, the live check cannot reach that surface.
  R19 then relies on the unit test and the source guard (R15, R17), and `build-notes.md` names each
  surface the baseline did reach.
- **The gallery arrows render only for a product with two or more images.** If the product
  `--open-quick-view` opens has one, `build-notes.md` says so (R8) and the arrows rest on the source test.
