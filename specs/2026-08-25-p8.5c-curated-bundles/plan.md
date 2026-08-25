---
id: p8-5c-curated-bundles-plan
title: "P8.5c — Curated Bundles (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-25
visibility: internal
summary: A vendor-curated Bundle of existing products that expands into ordinary cart lines through the existing addItems transaction, merchandised on /categories with a live derived total and — by explicit decision, until P8.5d ships the pricing engine — no savings claim at all.
tags: [p8.5, storefront, cart, staff-panel, bundles, merchandising]
related: [p8-5a-product-card-upgrade-plan, p8-5b-department-hero-plan]
---

# P8.5c — Curated Bundles (plan)

## Why this slice exists

P8.5's brief asks for curated value bundles — "Weekly Halal Family Meat Box", three products sold
as one merchandising unit. The AI Studio prototype models this as
`BundleItem` (`docs/ui-ref-revised/src/types.ts:116`) carrying `price`, `originalPrice`, `badge`
and a hand-written `savingsText`.

**That shape was rejected at `/propose` (2026-08-24), and this slice is the alternative.** A bundle
here is a *curated, named list of existing products that expands into normal cart lines* — not a
purchasable SKU with its own price and stock. The rejected alternative would need its own inventory,
its own decrement inside `placeOrder`'s transaction, and its own cases in refunds, loyalty and
discounts: four subsystems changed to sell three things already in the catalogue. The curated-list
shape changes none of them. After "Add all N to basket", the cart holds ordinary `CartItem` rows and
every downstream path — checkout, stock decrement, Stripe, confirmation email, points — is untouched.

**Goal:** let a vendor curate and merchandise a bundle, and let a shopper add all of it in one
action, without inventing a second cart-write path or a second discount mechanism.

## The decision that most shapes this slice: no savings claim

P8.5d (#348) — auto-applied, quantity-triggered tier pricing, which is #147 plus a quantity
predicate — **is not built**. Nothing in the current engine applies a discount without a typed code
(`DiscountCode.code` is required, `@@unique([vendorId, code])`, and `lib/discounts.ts` normalises a
code on both the create and lookup paths). So a bundle added to the cart costs exactly the sum of
its constituent lines.

**Decided by the human at `/propose` (2026-08-25): this slice makes no savings claim anywhere.**
The card shows the constituents, their quantities, and the live derived total. There is no
"Save £X" badge, no struck-through `originalPrice`, no `savingsText`. Those arrive with P8.5d, at
which point the figure will be backed by a discount that actually applies.

The alternative — pulling a minimal bundle-scoped auto-discount into this slice — was considered and
lost: it would bury an engine change inside a merchandising change, which is the exact thing #347's
own text warns against, and it would become P8.5d by the back door inside a slice nobody scoped for
it.

**The honest consequence, stated rather than glossed:** for the duration of this slice, "curated
value bundles" delivers curation and convenience, not value. This document, the CHANGELOG entry and
the staff UI all say *curated bundles*, not *value bundles*, for that reason.

**One boundary this rule does not cross, found while writing the spec rather than at Validate.**
`ProductCard` has rendered "Save {formatPrice(saving)}" and a struck-through `originalPrice` since
P2.5b1, for any product where `originalPrice > basePrice`
(`components/product/ProductCard.tsx:88`, `:134`). That is a true claim about an individual product,
independent of bundles, and it keeps working. "No savings claim" here means **no bundle-level
claim** — no stored bundle price, no derived-vs-stored comparison, no "this bundle saves you £X". A
requirement or a grep written as a blanket "no `save` text in the bundles section" would fail as
soon as a bundle contained a product that is genuinely on offer, and the only way to make it pass
would be deleting a correct, pre-existing feature — the same trap `sdd-workflow.md`'s Validate
section documents four times over. `requirements.md` R14 is scoped accordingly.

## Scope (this slice)

- **New models, `Bundle` + `BundleItem`**, both vendor-scoped.
  - `Bundle`: `vendorId`, `slug`, `name`, `tagline?`, `imageKey?`/`altText?`, `isActive`,
    `sortOrder`, `createdAt`/`updatedAt`; `@@unique([vendorId, slug])`, `@@index([vendorId,
    isActive])`.
  - `BundleItem`: `bundleId`, `productId`, `quantity` (`Int`), `sortOrder`;
    `@@unique([bundleId, productId])`.
  - **Deliberately no stored price or saving column of any kind.** A bundle's total is derived from
    its constituents' live `Product.basePrice` at read time. The accepted cost, taken knowingly:
    the figure moves when constituent prices move and cannot be hand-set — which is *more* correct
    than a stored price that drifts, but means the "value" story genuinely depends on P8.5d.
- **`lib/repositories/bundles.ts`** — pure functions taking `prisma` and `vendorId` explicitly,
  reading no request context. **`lib/bundles-service.ts`** — the request-scoped facade beside it,
  never inside it. `tests/repository-purity.test.ts` enforces this whole-file at import level with
  no allowlist (#252 / P8.1b), so there is no version of this that passes by argument.
- **Storefront section on `/categories`** — placed after the department scroller and before
  "New Arrivals". `/categories` is the shop page as of P8.5f; the landing page keeps only its hero
  and trust strip, and this slice does not touch it. Renders each active bundle's name, tagline,
  constituent list with quantities, and the derived total.
- **"Add all N to basket"** — a server action resolving the bundle's items into `MergeLine[]` and
  calling the existing `addItems`. `addCartItems` (`lib/repositories/cart.ts:300`) already runs one
  transaction for the whole list and already collapses duplicates via `sumLinesByProduct`, so a
  bundle naming something the shopper already has in their cart needs no new handling.
- **Availability resolved in the action, before the write** — see "The stock-reporting problem"
  below.
- **Staff CRUD at `/staff/bundles`** — list, create, edit, activate/deactivate, add/remove
  constituent products with quantities. Gated by `requireVendorRole("ADMIN")`; the refusal branch
  renders `<PanelRefusal>`, never `return null` (CLAUDE.md's staff-panel rule; #350 is an open
  instance of getting exactly this wrong).
- **Banner image** — `imageKey`/`altText` plus upload, reusing P8.5e's
  `CampaignBannerUploader` shape and `lib/product-image.ts`'s existing
  `IMAGE_CONTENT_TYPE`/`IMAGE_QUALITY`/`MAX_IMAGE_EDGE_PX`/`fitWithinEdge` constants as-is. Key shape
  `bundles/{bundleId}/{uuid}.webp`, shape-checked and refused rather than normalised, matching
  `isProductImageKey`. Cards render token-styled with no image, so an imageless bundle is a
  first-class state and not a broken one.
- **Seed data for both vendors, SriMart included.** `prisma/seed.ts` warns rather than silently
  skipping SriMart (#276), so a one-vendor seed would be visible — and a bundle-less second vendor
  is exactly the gap that makes per-vendor rendering bugs invisible.

## The stock-reporting problem, and why the fix lives in the action

`addCartItems` filters out-of-stock lines (`lib/repositories/cart.ts:320`) and returns `void`. It
cannot tell a caller that two of a bundle's four items were unavailable, and a shopper who clicks
"Add all 4" and silently receives 2 has been misled.

Two ways to fix it:

1. **Change `addCartItems` to return a result.** Rejected — `addListToCart` (P3d) and the merge path
   also depend on it, so this changes a shared, transaction-carrying cart write path to serve one
   new caller's reporting need.
2. **Resolve availability in the bundle action, before calling `addItems`.** Chosen. The action
   already reads the bundle's constituents to build `MergeLine[]`; reading their stock in the same
   query costs nothing extra, and the shared write path is untouched.

**The accepted imprecision, named so it reads as a decision:** stock is read before the write, so
between the read and the transaction another shopper can take the last unit. The write path still
clamps correctly — no overselling becomes possible — but the message shown to the shopper can be
marginally optimistic in that race. The alternative is option 1's blast radius, for a report that is
advisory rather than load-bearing.

## Deliberately excluded

- **Tier pricing and every form of savings copy.** P8.5d (#348). Named here as the single largest
  thing a reader might expect to find and will not.
- **Heavy-item free-delivery badging.** Free delivery is order-level only
  (`VendorConfig.freeDeliveryThresholdPence`); a per-product shipping override is a new concept in
  the delivery model, not a merchandising gap.
- **A per-bundle detail page.** The card carries the full constituent list; a bundle of three to
  five known products has nothing a detail page would add that the card cannot hold.
- **Bundles on the landing page.** Explicit decision above — P8.5f slimmed it one slice ago.
- **Bundle-level stock, reservations, or a "bundle unavailable" state.** A bundle is a view over
  products; its availability is its constituents' availability, resolved per-line at add time.
- **Nested bundles, or a bundle constituent that is itself a bundle.** `BundleItem.productId` is a
  `Product` FK; the shape makes this unrepresentable, which is the intended answer.

## Open items carried forward

- **The PR #371 roadmap change-log row** rides this branch under the carry-forward rule (doc changes
  after a merged promotion land on the next slice's branch, not a PR of their own).
- **Whether P8.5d should renumber or absorb #146** (discounts scoped to a category or product) is a
  `/spec` question for *that* slice, unchanged by this one — recorded so it isn't mistaken for
  settled.
- **A bundle whose constituent is later deleted or deactivated.** This slice reads only active,
  in-stock constituents at render time, so such a bundle quietly renders shorter. Whether staff
  should be *warned* about a degraded bundle in the admin list is deferred; it needs a UI decision
  and this slice is already carrying storefront, cart, admin and upload surfaces. **Tracked as
  #373.**
- **No AI "Auto-Generate" on the bundle image uploader**, unlike the campaign banner's. The AI route
  builds its prompt from a campaign's `headline`, which a bundle has no equivalent of — an
  equivalent needs its own route and its own prompt decision. **Tracked as #372.**
