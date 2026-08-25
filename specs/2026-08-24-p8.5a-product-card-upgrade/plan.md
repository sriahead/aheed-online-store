---
id: p8-5a-product-card-upgrade-plan
title: "P8.5a — Product card upgrade (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-24
visibility: internal
summary: First slice of P8.5 — skew geometry with tokenised colour, a coalesced cart-mutating quantity stepper on the product grid, and a low-stock badge from the existing Inventory join. No schema migration.
tags: [p8-5, storefront, product-card, cart, accessibility]
---

# P8.5a — Product card upgrade (plan)

**Goal:** deliver the brief's "Skewed E-Commerce Product Cards Upgrade" against real data, and in
doing so replace the grid's pre-add quantity picker with a stepper that reflects and mutates the
actual cart — without reproducing the mutation-rate pathology tracked as #236.

This is the first of P8.5's four slices (#344) and the only one with no external dependency: no
artwork, no schema migration, no discounts-engine change.

## Scope (this slice)

### 1. Skew geometry

Port the mechanics of `docs/ui-ref-revised/src/index.css:183-230`, not its values:

- A `perspective` wrapper; the card at `skewX(-2deg)`; an inner content element counter-skewed
  `+2deg` so text and images stay crisp; badges at `-6deg`; the price tag at `-4deg`. On hover
  everything straightens to `0deg` and the card lifts `translateY(-6px)`.
- **Transitions name their properties** — `transform`, `box-shadow`, `border-color`. No
  `transition-all`, and no global element-selector transition rule. PRs #323, #324, #326 and #330
  were all refresh-jank fixes and `CLAUDE.md` bans both patterns. `transform` is in Tailwind 4's
  default `transition` property list, verified by compiling Tailwind directly during #326.
- **Colour comes from semantic tokens.** The reference's hover shadow is `rgba(27, 94, 32, .18)` —
  Aheed's green — and the file carries roughly 200 `#1B5E20` literals besides. SriMart's real
  primitives are `#1e88e5` blue, `#8e24aa` purple and `#c62828` red, so a literal here visibly
  breaks a live vendor.
- **`prefers-reduced-motion: reduce` disables the skew and the lift.** There is currently **no CSS
  `@media (prefers-reduced-motion)` block anywhere in this repo** — `PromoCarousel.tsx:55` handles
  it in JS via `matchMedia`, which is the only instance. This slice introduces the first CSS one.
  It goes in `app/globals.css`, alongside the existing `.no-scrollbar` utility, which is the
  precedent for component-support CSS living there.

### 2. Cart-aware quantity stepper

Today `components/cart/AddToCartButton.tsx` `variant="card"` picks a quantity *before* adding —
local `useState`, then one `addToCart(productId, qty)`. This slice makes the control reflect and
mutate the **cart**.

**Where the data comes from.** `components/layout/Header.tsx:83-86` already calls
`getCartRepository().getSummary()` on every storefront page, to render the cart drawer. The cart is
therefore already loaded on the homepage, category and search pages. A layout cannot pass props to
`children`, so each grid page needs its own read; that read must be memoised (React `cache()`) so
the request issues one `getSummary()` query rather than a second identical one.

**Why coalescing is a requirement and not an optimisation.** `features/cart/shared.ts`'s
`revalidateCartSurfaces()` calls `revalidatePath("/", "layout")` — the **entire storefront tree**,
header drawer included — on every cart mutation. A stepper that fires one server action per click,
rendered on twenty cards, is #236's measured pathology reproduced by design rather than by
accident.

So: local quantity updates instantly, and a burst of clicks collapses into **one**
`updateQuantity(productId, finalQuantity)` call after a short idle window. This is not a workaround
invented here — **#236's own "worth checking when picked up" section names it**: *"whether
`addToCart` should coalesce or debounce client-side, which would remove the pathological pattern
regardless of the server-side cause."*

#236 stays open. This slice does not attempt its server-side root cause, which #236 itself says
depends on observability delivered by #218.

### 3. Low-stock badge

`Inventory.quantity` and `Inventory.lowStockThreshold` already exist in the schema.
`ProductSummary` (`lib/repositories/products.ts:23`) exposes only `inStock: boolean`. Surface the
count so a card can render "Only N left". A repository and type change — no migration.

### Blast radius

`ProductCard` renders in four places: `app/(storefront)/categories/[slug]/page.tsx:91`,
`app/(storefront)/search/page.tsx:93`, and twice via `components/product/ProductRow.tsx:33` on the
homepage. All three pages need the memoised cart read.

## Deliberately excluded

- **Butcher-cut availability tagging** and the **approximate scale-weight badge**. There is no
  `ProductVariant` model, no meat-cut model, and no `isApproximateWeight` field. The brief presents
  these as card styling; they are data models this repo does not have.
- **The multi-buy badge.** The badge is trivial and the pricing behind it does not exist —
  `DiscountKind` is `PERCENTAGE|FIXED_AMOUNT` only and `DiscountCode` requires a code. That is
  #348 (P8.5d), which closes #147.
- **The wishlist heart.** The storefront has no wishlist at all; that is #232.
- **A server-side fix for #236.** Out of scope, and blocked on measurement.
- **Per-unit price ("£/kg").** The reference derives it from `variant.weightGrams`, which does not
  exist here. `Product.unitLabel` is a free-text string ("£2.40 / kg"), not a computable quantity.

## Open items carried forward

- **#236** stays open, no longer aggravated by this slice but not resolved by it.
- **#232** (wishlist) and **#348** (multi-buy pricing) both own card affordances this slice
  deliberately leaves off, so the card will gain further badges later.
