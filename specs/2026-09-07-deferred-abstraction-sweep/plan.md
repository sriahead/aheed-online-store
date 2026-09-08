---
id: deferred-abstraction-sweep-plan
title: "Deferred-abstraction sweep — UI primitives, radius scale, theme catalogue and sortable unit pricing (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-07
visibility: internal
summary: "Builds the four layers this repo deferred as speculative — a UI primitive layer, a usable radius scale, a named theme catalogue and a derived sortable unit price — now that each deferral's own stated precondition has been met, and fixes the product card's invalid content model in the same edit."
tags: [design-system, tokens, primitives, multi-tenancy, pricing, accessibility]
related: [design-system, adr-004-multi-tenancy, discovery-log]
---

# Deferred-abstraction sweep — UI primitives, radius scale, theme catalogue and sortable unit pricing (plan)

Closes **#662** (umbrella), covering **#656**, **#398** (derivation half), **#351** and **#75**,
plus the two issues each of those turned out to require: **#653** and **#639**.

**Goal:** build the four abstractions this repository deliberately deferred, now that each
deferral's own stated precondition has been met — and prove the deferral rationale has genuinely
expired rather than assuming it. Shipping this slice means `/staff/storefront` can set a whole
vendor palette, the catalogue can sort by a unit price that is derived rather than typed, the
control layer has a canonical geometry instead of four radii and five paddings, and the product
card is valid HTML.

## Why these are one slice and not four

Each of the four was deferred with an explicit "build it when there is evidence", and each of those
conditions has now been satisfied by work that has already shipped:

- **#656** — `specs/design-system.md`'s "What's deliberately not here yet" section defers
  `components/` and `design-system/{components,patterns,pages,guidelines}/` because "nothing
  consumes tokens yet — first real usage is P1+ feature UI. Building these now would be
  speculative." That was written before P1. It is now after P9.2, and the duplication counts are
  precisely the evidence it asked for.
- **#75** — deferred because "payoff needs an admin surface." `#634` and `#631` built that surface.
- **#398** — `unitLabel` stayed free text because no feature needed a unit dimension. UK Price
  Marking Order compliance now does.
- **#351** — its own issue says it is "worth doing alongside a slice already editing the card."
  This slice edits the card.

The shared mechanism is the reason to do them together rather than the theme: **#649 and #650 both
reached double-digit site counts from one author decision**, because there was no layer at which
that decision could be made once. Two of the four items here are that missing layer.

## Scope (this slice)

**Ordered, because each step depends on the one before it.**

**1. The radius scale (#653).** `design-system/tokens/tokens.css` declares three radius tokens
(`sm`, `md`, `full`) while **seven** distinct Tailwind radius steps are in active use — 408
occurrences across 186 files, led by `rounded-2xl` (141) and `rounded-xl` (94), neither of which
any token names. Tailwind v4's `@theme` **merges** with its default scale rather than replacing it,
so overriding only `sm` and `md` produces two silent aliases: `rounded-sm` and `rounded-lg` both
resolve to `0.5rem`, `rounded-md` and `rounded-2xl` both to `1rem`. A `Card` primitive cannot pick
a radius from that scale without baking the ambiguity into the component layer, which is why this
goes first and why it is a prerequisite rather than a pairing.

**The ambiguity is removed by retiring a utility, not by changing a value (R1, R2).** This is the
part worth getting right, because the obvious reading of "fix the radius scale" is the one that
breaks the tie by picking new numbers — restyling real screens a week before UAT. The two colliding
pairs already render identically, so rewriting the 37 `rounded-sm` and `rounded-md` call sites to
`rounded-lg` and `rounded-2xl` produces a byte-identical page while leaving exactly one utility per
distinct value. The tokens then name the steps that survive. R1 forbids any token's value from
changing at all, so the restyling reading fails validation rather than depending on the builder to
notice. `specs/design-system.md`'s Shape table is rewritten to match.

**2. The primitive layer (#656) and the card's content model (#351), in one edit.**
`components/ui/` and `components/forms/` contain only `.gitkeep`. The **string** layer is already
done — `lib/form-classes.ts` shipped hours before this slice (#649/#650) and deduplicated
`inputClass`, `labelClass`, `errorInputClass` and `buttonClass`, and its own doc comment names #656
as the follow-on. So this step is the **markup** layer that file deliberately did not build: a
`Card`, a `Button` and a `FormField`, built on those existing strings rather than replacing them.

`components/product/ProductCard.tsx` is migrated to `Card` and, in the same edit, stops nesting
interactive content inside its link. The card-wide `<Link>` currently carries both `.skew-card`
(which drives the shared 3D motion, styling `-inner`, `-badge` and `-price` descendants on hover)
and Tailwind's `group` (driving the image zoom and the title colour). Both move to the wrapping
element and the link becomes a stretched link on the title, so `AddToCartButton` and
`CartQuantityStepper` become siblings of the link rather than descendants of it. `.skew-card*` is
shared with `components/bundle/BundleCard.tsx`, so the CSS must not regress that card.

**3. The branding form (#639), then the theme catalogue (#75).** `StorefrontConfigForm` renders
inputs for two of `VendorBranding`'s eight brand primitives and its submit path reads only those
two, while `lib/repositories/vendor.ts`'s `BRAND_FIELDS` loop already writes whichever of the eight
are supplied — the write path is built and unused. Its props are also `initialConfig: any` and
`initialBranding: any`, and #639 records that typing them properly and surfacing the six unused
fields are one piece of work rather than two. Only once all eight are settable does a `Theme`
catalogue mean anything, so #639 lands first and #75 builds the `Theme` model, the `themeId` FK and
the picker on top of it.

Two decisions this slice takes rather than leaves open:

- **`Theme` is a platform catalogue and carries no `vendorId` (R21).** A theme is curated for reuse
  *across* vendors — that is the entire point of #75 — and it holds no tenant data. That makes it a
  stated exception to ADR-004 decision 2's row-level tenancy rather than an oversight, and R39 puts
  it in the ADR so the next reader finds a ruling instead of an anomaly.
- **Selecting a theme copies its eight values onto `VendorBranding` (R23).** `brandStyle()` keeps
  reading the vendor's own columns and never joins `Theme`, so a vendor can pick a theme and then
  adjust one colour without the picker fighting them. `themeId` records provenance, not authority.
  The alternative — resolving through the FK at render time — would put a join on every request's
  hot path to make divergence harder, which is backwards on both counts.

**4. Unit pricing (#398, derivation half).** `Product.basePrice` is integer pence and
`Product.unitLabel` is a free-text display string with no computed relation to it — written from
one form field, validated only for non-emptiness, and rendered verbatim in seven places with no
code anywhere parsing a number out of it. This slice adds a unit-of-measure dimension, derives the
unit price from it, makes that derived value sortable **in the database**, and demotes `unitLabel`
to a fallback for products that have no net content.

**Two columns, because they answer different questions (R30, R32).** The *displayed* unit price is
computed at render time from `basePrice` and net content, exactly; the *stored*
price-per-base-unit column is a denormalised integer sort key, recomputed on every write and never
shown to a customer. #398 frames these as an either/or — a stored column that can be sorted, or a
query-time computation that cannot. Taking both is what keeps a rounding artefact in the sort key
away from a price a shopper reads, which for a Price Marking Order exposure is the whole point.

**Sorting is delivered at the data layer, and the storefront sort control is not in this slice.**
`findPage` in `lib/repositories/products.ts` is hardcoded to keyset pagination on
`(createdAt, id)`, and `specs/architecture.md` requires a cursor's ordering key to *be* the sort
key while prohibiting `OFFSET`. So a user-facing "sort by unit price" means changing every
listing's cursor semantics, and there is no sort control anywhere in the app today to extend — it
would be a new URL parameter needing a fourth registration point alongside the three
already-unsynchronised filter-key lists (#601). R37 proves the column is genuinely sortable with a
real indexed query; the control is left to the P10 sort/filter work where the cursor change
belongs.

## Deliberately excluded

- **The variant model.** #398's own text says the choice between grouped `Product` rows and a
  `ProductVariant` child model "needs `/propose` before any `/spec`", and `specs/roadmap.md` places
  only the unit-price half in P9.3 with variants in P10. That decision propagates into cart,
  inventory, `OrderItem`, tier pricing and the admin UI. The Price Marking Order exposure — a
  hand-typed string that can silently disagree with `basePrice` — closes on derivation alone.
  Multi-weight products (the same rice at 1kg / 5kg / 10kg) remain separate `Product` rows with no
  grouping, exactly as today.
- **`Toast` and `Skeleton` primitives.** #656 is explicit: nothing in the app dispatches a toast and
  there are zero `loading.tsx` files. Building them because the list of primitives has a gap is the
  same speculative reasoning this slice exists to retire, and it is still correct for those two.
- **Vertical-specific card components.** `ProductCard` stays one configurable component.
- **Any primitive that needs client JavaScript to render a form field.** Progressive enhancement is
  load-bearing here — server-rendered forms posting to server actions, GET-form search and filters.
  A primitive that removed that would be a regression, not an abstraction.
- **A repo-wide migration of every call site onto the new primitives.** There are 87 lines combining
  the card surface classes and 24 button call sites spread across **17 distinct** radius/padding/
  disabled/hover combinations. Migrating all of them is an unbounded diff immediately before launch
  certification, which is the specific risk this slice already carries enough of. R9 instead
  requires each primitive to have at least three real adopters — enough to prove the layer works
  and to keep the old constants honest — and #656's own recommendation to "migrate a route group at
  a time, verify after each" stands as the shape of the follow-on work.
- **A storefront sort control for unit price** — see step 4. The column is sortable; the UI is not
  built, because it requires changing `findPage`'s keyset cursor for every listing.
- **The three unsynchronised filter-key lists (#601).** This slice adds no URL parameter, so all
  three are untouched. It does not build the mechanical check that would keep them in sync.
- **`prisma/generate-catalogue.ts`'s `formatUnitLabel`.** It self-documents as the thing #398
  replaces, but it seeds the generated scale-testing catalogue only. Net content is nullable, so
  those products keep working on `unitLabel` alone.
- **A net-content snapshot on `OrderItem` (R35).** That table already snapshots `unitPricePence` —
  what the customer actually paid — and nothing recomputes a unit price for a historical order, so
  there is no drift for a snapshot to prevent.
- **A lint rule banning raw hex or px.** Still deferred, as `specs/design-system.md` records.
- **Dark mode.** No requirement exists.

## The sequencing risk, recorded deliberately

This lands immediately before **#439** (LCP measurement), **#441** (UAT), **#442** (accessibility
validation) and **#444** (exact release-candidate verification), and `specs/roadmap.md` P9.3 says
"test the actual candidate rather than continuing to add architecture."

**That conflict was raised at `/propose` and the sequencing was chosen anyway, deliberately**, on
the reasoning that validating a UI you already intend to replace means running that validation
twice. It is recorded here so a later reader sees a decision rather than an oversight. The
practical consequence is a real one and belongs in this file: **#439, #441, #442 and #444 must run
against the post-slice UI**, and any of them already run against the pre-slice candidate is void.

## Known traps this slice must not fall into

- **A token added only to `tokens.css` never reaches a real page.** `brandStyle()` returns an
  inline style on the root element, which outranks a `:root` stylesheet rule, so any semantic token
  it lists must be handled there too. This is the #251 failure and it recurred at #649.
- **`prisma migrate dev` will attempt to drop the three hand-authored `pg_trgm` indexes.** This has
  fired on every migration generated since #508 — six occurrences — so `--create-only` followed by
  reading the generated SQL is the procedure, not a precaution.
- **An absence-grep must be scoped to the directory that would hold the defect.** Anything written
  in this spec is machine-copied into `app/(admin)/staff/runbook/docs.ts` and
  `kms/site-internal/content/` by the KMS generators, so a repo-root grep for a string this file
  discusses will match this file and its two generated copies. `validation.md`'s rows are scoped
  accordingly.
- **Two vendors, not one.** SriMart's primitives are real, live-differentiated values, and nothing
  in `lint`/`typecheck`/`test` checks a second vendor's rendered output. Live checks resolve the
  seeded `VendorDomain.host` values from the database under test rather than assuming the
  `nocaped.com` convention — that assumption cost a `/validate` round trip at #649.

## Open items carried forward

- **The variant model** — needs its own `/propose` before P10 work on #397's Pack Size facet or the
  butcher-cut selector (#399), both of which are downstream of it.
- **#601** — a storefront filter key lives in three unsynchronised lists, only two pinned by a test.
  Adding a unit-price sort touches that surface; this slice keeps the three consistent but does not
  build the mechanical check that would keep them so.
- **#513** — the delivery board's Phase field has no P9 or P10 option, so #662 carries no Phase.
- **Roadmap placement** — #656, #653, #75 and #639 are not currently referenced anywhere in
  `specs/roadmap.md`. The roadmap row for this slice is written at `/document`, and it must add
  them as well as recording the slice.
