---
id: p3d-shop-your-list
title: "P3d — Shop your list (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-10
visibility: internal
summary: "A shopper pastes a shopping list; each line is parsed for a quantity and matched to the vendor catalogue by token-AND on product name, then a mandatory review step turns confirmed lines into cart items in one transaction. Stateless: no schema change, no saved lists, no fuzzy matching."
tags: [p3, cart, storefront, search]
related: [roadmap, architecture, p3a-cart-foundation, p2b-catalogue-search, multitenancy-slice2-vendor-enforcement]
---

# P3d — Shop your list (plan)

The last P3 slice (issue #114, epic #86). P3a made the cart real, P3b turned a cart into an order,
P3c made the money move. P3's scope in `specs/roadmap.md` also folds in **"Shop your list"** as a
*cart-entry path* — a second way to fill the cart that isn't clicking "Add to Cart" on a product
card. Until it ships, P3 cannot close.

**Goal:** a shopper pastes or types a shopping list in one box, sees exactly what each line matched
in this vendor's catalogue, corrects what's ambiguous, and adds the confirmed lines to their
existing cart in a single action — with nothing entering the cart they did not see.

## Scope (this slice)

**Parsing — `lib/shopping-list.ts`, pure, no I/O.**
The list is split on newlines and each non-blank line is parsed into a quantity and a set of search
terms. Recognised quantity forms are a leading `N`, a leading `Nx` / `N x`, and a trailing `xN` /
`x N`; anything else means quantity 1.

One rule earns its own mention because this catalogue makes it load-bearing: **a leading bare
integer is only a quantity when it is not glued to a unit.** `2 apples` is two apples, but
`5kg basmati rice` is one bag of *Basmati Rice 5kg* — the `5` is part of a size, not a count. Real
seeded product names (`Basmati Rice 5kg`, `Sunflower Oil 2L`, `Mixed Nuts 500g`, `Orange Juice 1L`)
mean a shopper transcribing a label hits this on ordinary input, not as an edge case.

**Matching — one query, then pure ranking.**
A new `ProductRepository` method takes the distinct terms across the whole list and issues **one**
query for candidate products whose `name` contains any of them, bounded by an explicit cap. Every
line is then resolved against that candidate set by pure, unit-testable code: a product matches a
line when its name contains **all** of that line's terms. This is deliberately one round trip for
the whole list rather than one per line — a 100-line list must not become 100 queries.

Ranking is total and deterministic, so the same list always produces the same review screen: an
exact normalised name equality wins outright; otherwise all-terms matches rank ahead of the rest,
shorter names ahead of longer ones (a shorter name containing every term is the more specific
product), and name-alphabetical last as the tie-break.

Each line therefore resolves to exactly one of **matched** (one candidate), **ambiguous** (more than
one), or **unmatched** (none). Ambiguity is real here rather than theoretical: `milk` matches both
*Whole Milk* and *Coconut Milk* in the seeded catalogue.

**Review before anything is written.**
`/shop-your-list` renders the entry box; submitting it parses and matches, and renders a review of
every line — matched lines with their parsed quantity, ambiguous lines with a chooser, unmatched
lines flagged, and matched-but-out-of-stock lines shown as unavailable and excluded. Only an
explicit "Add to cart" action writes anything. The matching pass performs **no cart write at all**,
so a shopper who pastes a list and leaves has no cart, no cookie, and no row — preserving P3a's
lazy-creation property, under which browsing (including by crawlers) never creates state.

**Bulk add — one transaction.**
A new `CartRepository.addItems()` adds every confirmed line in a single transaction with a single
cart resolution, rather than N sequential `addItem()` calls. It reuses `effectiveStock()` and
`clampQuantity()` from `lib/cart-rules.ts` rather than re-deriving the maths, so an over-quantity
line clamps to available stock and an out-of-stock line is refused, identically to the per-product
path. Quantities are **added to** what is already in the cart, matching what "add to cart" means
everywhere else in the app.

## Deliberately excluded

- **Saved lists.** No `ShoppingList` aggregate, no schema change, no migration. Reusable weekly
  lists are a retention feature closer to P5 than to P3's cart-entry path, and would drag in
  account-area UI plus guest-vs-user ownership rules. The cart is this slice's persistence.
- **Typo tolerance / fuzzy matching.** `bannanas` reports as unmatched. Handling it means
  Postgres `pg_trgm`, whose `similarity()` needs `$queryRaw` — forbidden in application code by
  `CLAUDE.md` — and P2 deliberately deferred trigram search until the catalogue outgrows its
  placeholder data. One slice is not the place to reverse two standing decisions. The mandatory
  review step is what keeps this honest: an unmatched line is *visible*, not silently dropped.
- **Matching on `description`.** The existing `search()` ORs `name` and `description`; list
  matching uses `name` only. A term matching prose in a description produces a confident-looking
  wrong match, which is precisely what the review step exists to prevent — better to report
  unmatched than to offer a plausible wrong product.
- **Reordering from a past order.** That needs order history, which is P4.
- **Barcode, photo, or voice input.** Not proposed, not in P3.
- **Changing `ProductRepository.search()`.** The catalogue search path is untouched; list matching
  is a separate method with different semantics. Nothing about P2b's behaviour changes.

## Open items carried forward

None specific to this slice — it needs no credential, no external resource, and no schema change.

The P3 *phase* still has launch blockers that are not P3d's to fix and do not gate it: **#104**
(Resend has no verified sending domain), **#113** (production runs Stripe test-mode keys), and
**#111** (production webhook signing secret needs owner confirmation). P3d ships behind the same
closed storefront the rest of P3 currently sits behind.
