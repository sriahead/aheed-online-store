---
id: p232-1185-favourites-card-controls-plan
title: "Favourites, and a bare + on the product card (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-20
visibility: internal
summary: "Slice 1 of the Quick Shop programme: an authenticated-only Favourites feature (#232) with a heart on every product card and a listing page, bundled with replacing the card's Add button and pre-add quantity picker with a single + (#1185)."
tags: [favourites, product-card, cart, storefront, schema]
related: [architecture, design-system, app-conventions, p1180-shared-page-container-plan]
---

# Favourites, and a bare + on the product card (plan)

Slice 1 of three in the Quick Shop programme approved at Gate 1 on 2026-10-20. The other two are
`#1186` (a Regulars placeholder page) and `#1187` (the Quick Shop four-tile hub and the Smart Lists
rename). `#1184` (reading a list from a photo) is deferred out of the programme entirely.

**Goal:** give a shopper a durable, per-vendor list of products they want to come back to, and make
the card's add control one tap instead of a compound widget. Shipping this unblocks `#1187` — the
hub cannot ship with a Favourites tile that points nowhere.

## Why these two are one slice

They are bundled because they rewrite **the same two regions of the same component** and thread
their new state through **the same three call sites**:

- `components/product/ProductCard.tsx:328-343` is the control row `#1185` rewrites; the heart
  `#232` adds goes into the image block directly above it, at `:191-202`.
- Both need a new per-product prop in `app/(storefront)/categories/[slug]/page.tsx:219`,
  `app/(storefront)/search/page.tsx:345` and `components/product/ProductRow.tsx:65` — exactly
  where `cartQuantity` already goes.

Split across two slices, that is two passes over one file, two prop-threading passes through the
same three pages, and two rounds of the same card tests.

## Scope (this slice)

### Persistence

A `Favourite` model in `prisma/schema.prisma`, modelled on `Review` (`:1024-1039`), which is the
existing precedent for a vendor-scoped row keyed by user **and** product:
`vendorId`, `userId`, `productId`, `createdAt`, with `@@unique([vendorId, userId, productId])` and
`@@index([vendorId, userId, createdAt])` for listing newest-first. Strict relational, explicit
foreign keys, no `Json` column, per `specs/architecture.md` section 3.1. Back-relations are added to
`User`, `Vendor` and `Product`.

The migration is generated with `--create-only` and its SQL read before it applies. Prisma has
proposed dropping the hand-authored `pg_trgm` indexes on every migration since `#508`, so the
generated file is checked for that specifically, not just skimmed.

### Data access

- `lib/repositories/favourites.ts` — pure functions, each taking its Prisma client plus `vendorId`
  and `userId` as explicit parameters and reading no request context, matching
  `lib/repositories/reviews.ts`. Enforced without allowlists by `tests/repository-purity.test.ts`
  and `tests/repository-client-injection.test.ts`.
- `lib/favourites-service.ts` — the request-scoped facade, constructed fresh per call and never
  cached, matching `lib/reviews-service.ts`.
- **All of it runs on `getPrisma()`.** A singular `create` with no nested writes, a `deleteMany` and
  the reads are all safe on the HTTP client; nothing here opens an implicit transaction, so
  `getPrismaWs()` is not used. This is a deliberate decision recorded here because the rule in
  `CLAUDE.md` is "does this open an implicit transaction", and a later reader should not "fix" this
  to the WebSocket client.

### The duplicate-key guard

Toggling on is a `create`. Two taps racing each other means the second hits
`@@unique([vendorId, userId, productId])`, and **that is a success, not an error** — the product
ends up favourited either way, so the toggle is idempotent.

`CLAUDE.md` records that the two adapters report this same Postgres error under different `.code`
values: raw SQLSTATE `"23505"` through one and Prisma's `P2002` through the other. A pure predicate
in `lib/favourites.ts` accepts both, and it is verified **against a real failing request** by
`scripts/verify-favourites.ts` rather than a hand-built double — the repository-purity property is
what makes that script possible in plain Node.

### Card UI

- A heart control on every product card, in three states driven by one prop rather than a pair of
  booleans that could contradict each other: `favouriteState` of `"on"`, `"off"` or `"signed-out"`.
- **Placement resolves a real collision.** The card's top-right 44px box is already the
  below-`sm` quick-view button (`:191-202`), and the top-left holds the Halal/Fresh/Offer badges
  (`:103`). The heart therefore sits one 44px box inboard below `sm` and at the corner from `sm` up,
  where the quick-view button is `sm:hidden` because quick view moves into the hover overlay.
- `AddToCartButton`'s `card` variant becomes a single `+` icon button. The `sm:`-and-up pre-add
  picker (`components/cart/AddToCartButton.tsx:126-145`) and the "Add" text go. The `icon`, `full`
  and `drawer` variants are untouched.

### A persistent doc this slice must update

`specs/design-system.md`'s "Touch targets" section names the storefront's primary shopping controls,
and one of its bullets is *"the product card's Add button and its pre-add minus and plus"*. That
bullet becomes false the moment `#1185` lands, so the section is updated in this slice rather than
left to go stale — the dated folder is the one-time record, the persistent doc is what future
sessions read as current truth.

The same section explains that `tests/tap-targets.test.ts` guards both a `data-tap-surface` hook and
the `tap` class per file. The heart therefore carries
`data-tap-surface="product-card-favourite"` and `ProductCard.tsx` joins that test's map, so the
measuring script can group it and a later slice cannot quietly drop it.
`components/cart/AddToCartButton.tsx` stays in the map for `quick-view-add`, which belongs to the
`drawer` variant this slice does not touch.

### Pages

- `/account/favourites`, listing favourited products as `ProductCard`s in a `ProductGrid`, with the
  owner's empty-state copy. Auth-gated and laid out exactly like `/account/lists`
  (`dynamic = "force-dynamic"`, session read, `redirect("/login")`, `PageContainer`).
- A Favourites tile on `/account`, beside Orders, Lists, Loyalty and Data.

## Deliberately excluded

- **Guest favourites.** `#232`'s open question is resolved as authenticated-only by owner
  instruction on 2026-10-20. A guest sees the heart, and it is a link to `/login` rather than a
  toggle. The alternative — a guest token like `lib/cart-identity.ts`'s — lost on cost, not
  feasibility: it brings a second guest-ownership lifecycle, a merge-on-sign-in path and an orphan
  sweep. `/shop-your-list`'s `canSave` prop is the existing precedent for this exact split.
- **A header heart.** P6.6 obliges the storefront header to render a wishlist link, and this slice
  does not add one — Favourites is reached from `/account` here and from the hub in `#1187`. The
  owner accepted the hub tile as the entry point, so **P6.6's requirement text is amended in this
  slice** to say so. Editing a gate to match the implementation certifies nothing, which is the
  principle `#232` was filed under; amending it explicitly, with the decision and its author
  recorded, is the honest form.

  **A citation correction found while writing this spec.** `#232`'s body attributes that obligation
  to P6.6's **R1**. It is **R6** (`specs/2026-08-13-p6.6-p0-ui-overhaul/requirements.md:32`), which
  already reads "Deferred — not satisfied by the artifact" and "expected to fail until #232 ships".
  P6.6's R1 is the header logo requirement and has nothing to do with a wishlist. The wrong number
  has not yet reached any other artifact, so this slice amends R6 and does not propagate "R1"
  anywhere. This is the failure mode `specs/sdd-workflow.md` records from `#618`, where a wrong
  issue citation survived eight mentions across three months because every downstream file trusted
  the citation instead of reopening the source.
- **`CartQuantityStepper`.** It already does what `#1185` asks of the post-add state, including
  treating a decrement at 1 as removal (`:119`). Untouched.
- **The `drawer` and `full` quantity pickers.** Neither is a card; both keep theirs.
- **Sorting, paging or filtering the favourites list.** Newest-first, unbounded, matching how
  `/bundles` lists every active bundle. The index supports adding a cursor later.
- **Any cross-vendor view.** Favourites are per vendor by construction (ADR-004).
- **Reconciling a favourited product that later goes out of stock or is hidden.** The card renders
  its own out-of-stock state, so the list degrades honestly. A hidden-department equivalent is the
  open `#1139`, and this slice does not widen it.
- **Regulars (`#1186`), the hub and the Smart Lists rename (`#1187`), photo capture (`#1184`).**

## Reversal recorded on purpose

`#956`'s plan states, of the pre-add quantity picker: *"Unchanged, by owner decision at Gate 1."*
Removing it here is a deliberate reversal, re-approved by the owner on 2026-10-20. Two facts make it
cheap rather than a loss of function, and both are why the spec does not try to preserve the
picker's behaviour anywhere else:

- `#961` already hides it below `sm`, because a 2-column card at 360px has roughly 128px of content
  width and cannot hold a 44px minus, a readout, a 44px plus **and** the Add button. Most phone
  shoppers have never seen it.
- **A successful add on a card never shows "Added" anyway.** `addToCart` calls
  `revalidateCartSurfaces()`, the listing re-renders with the product's new `cartQuantity`, and
  `ProductCard` swaps the button for the stepper — so the button unmounts before its flash can be
  read. That finding is what produced the shared `CartFeedback` region in `#956`, and it remains the
  card's only outcome channel for `partial`, `AT_STOCK_LIMIT` and `SOLD_OUT`.

## Open items carried forward

- **The derivation behind Regulars** needs a threshold, a window, a vendor scope and a ruling on
  cancelled orders before it can be built. Tracked in `#1186`, which ships only the placeholder.
- **The "Your saved lists" naming collision** on the page being retitled Smart Lists. Tracked in
  `#1187`; it does not affect this slice.
- **Photo and camera list capture**, with its own open questions about where extraction runs and
  whether the image is stored. Tracked in `#1184`.
- **Validation independence.** If this slice is validated in the same session that builds it, that
  is recorded in `build-notes.md` as not independent, per the owner's standing choice below roughly
  60 percent context.
