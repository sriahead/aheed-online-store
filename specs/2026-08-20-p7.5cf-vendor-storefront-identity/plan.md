---
id: p7-5cf-vendor-storefront-identity
title: "P7.5c+f — Per-vendor storefront identity: copy, promotions & contrast-preserving colour (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-20
visibility: internal
summary: Removes Aheed's hardcoded copy and invented promo claims from shared storefront components, adds a 1:N VendorPromotion model driving a real hero carousel, and restores per-vendor semantic colour behind an OKLCH contrast clamp so vendors differ without breaching WCAG AA.
tags: [multi-tenancy, branding, promotions, accessibility, storefront, design-system]
# related: [adr-004-multi-tenancy, adr-003-storage, design-system, roadmap]
---

# P7.5c+f — Per-vendor storefront identity (plan)

**Goal:** make the storefront say and show *this vendor's* identity rather than Aheed's, on all
three axes it currently fails — the words on the page, the offers it advertises, and the colours
behind them — without letting any of them become a route to an accessibility breach or a claim the
system cannot honour.

This is P7.5 slices **c** and **f** combined (issues #263 and #266, closing #239, #233, #255). They
are one slice because they share a seam — a constant in a shared component that should be vendor
data — and, decisively, because neither can be proven by the test suite. Both are only observable in
**live rendered HTML for two hosts**, and that rig is the expensive part of validating either.

## Why the test suite cannot prove this

`lib/vendor-theme.ts`'s `brandStyle()` injects per-vendor CSS custom properties as an **inline style
on the root element**, and an inline style outranks any `:root` stylesheet rule on specificity. That
is exactly how #251's AA fix was silently defeated on every real page while its own jsdom contrast
test — which parses `tokens.css` directly — passed. `tests/design-tokens-contrast.test.ts` remains
correct and untouched; it answers a different question than the one this slice asks.

Every requirement below concerning rendered output is verified by fetching real HTML from
`npm run preview`, for Aheed's host **and** SriMart's, per `CLAUDE.md`.

## Scope (this slice)

### 1. Copy — shrink the surface before modelling it (#239)

A full inventory found ~12 hardcoded strings, not the two #239 named. Each is classified, and only
genuine vendor identity becomes a column:

- **Derived from data that already exists.** The hero's "Free Delivery Over £30" badge becomes the
  vendor's real `VendorConfig.freeDeliveryThresholdPence`. Aheed's threshold *is* £30, so the
  hardcoded string was accidentally true for the vendor it was written for and wrong for SriMart,
  whose threshold is £50 — the string was hiding a data bug, not merely a copy bug. A second badge
  renders `minimumOrderPence` on the same basis. Both hide when the value says the rule doesn't apply.
- **Deleted as unverifiable claims.** "100% Certified Halal Meat" and "Same-Day Local Dispatch" leave
  the hero. The first is Aheed-specific and gets a proper home below; the second is a service promise
  no data in this system backs, for any vendor.
- **Rewritten as platform-true copy.** The four trust tiles become three, each a statement true of
  the platform for every vendor and checkable against the repo: local delivery across the vendor's
  own `localityName` (derived), card payment via Stripe (`lib/payments.ts`), and order-status email
  (`lib/email.ts`).
- **New nullable columns where the copy is genuine vendor identity.** `VendorConfig.bannerNote` (the
  header's second banner line — Aheed's halal claim moves here) and `VendorConfig.heroSubtitle`.

### 2. Promotions — a real 1:N model replacing two kinds of fiction (#233)

Two separate defects turn out to be the same missing model:

- **`components/layout/PromoSlider.tsx` is a hardcoded array of three invented offers** — "up to 20%
  off on all fresh produce", "Fresh spices, lentils and cultural staples just landed", "Bulk Buy
  Discounts" — rendered on **every** vendor's homepage. It is Aheed copy on SriMart's storefront, and
  worse, it advertises discounts nothing backs: SriMart has zero discount codes seeded, and neither
  vendor has a "20% off fresh produce" promotion in the discounts engine. Its gradients are raw
  Tailwind literals (`from-amber-500`, `from-emerald-600`) that bypass the token system, so it
  ignores vendor branding too.
- **The hero has no per-vendor image** (#233). The hardcoded stock photo was removed in #231 for
  violating P7a's CSP, and nothing replaced it.

A single static image would have forced a vendor to merge several offers into one graphic or rotate
them by hand. Instead:

**`VendorPromotion(id, vendorId, title, description, imageKey?, altText?, linkUrl, sortOrder,
isActive, createdAt, updatedAt)`** — normalised, 1:N, no `Json` column, indexed
`@@index([vendorId, isActive, sortOrder])`. `imageKey` is a **relative storage key, never a URL**
(ADR-003), namespaced `vendors/{vendorId}/...` per ADR-004 decision 5.

`imageKey` is **nullable on purpose.** A promo with no artwork renders as a token-styled card — which
is precisely what today's `PromoSlider` already does with gradients — so both vendors seed real,
visible, live-verifiable promotions on day one with zero uploads. Seeding a key whose object does not
exist would reproduce **#244** exactly: a branding row pointing at a missing object, so every
homepage renders a broken image. Artwork upgrades a card when an owner supplies it; it is not a
precondition for the feature working.

**The hero's image slot becomes the carousel**, mapping over that vendor's active promos in
`sortOrder`. The hero's left column — tagline, subtitle, derived badges, and the postcode
deliverability checker — stays exactly where it is; the checker is real functionality, not decoration.
When a vendor has no active promos the hero renders single-column, unchanged. The standalone
`PromoSlider` lower down the page is **deleted**, not kept alongside: two promo carousels on one page,
one real and one invented, is worse than either.

**Accessibility is part of this, not a follow-up.** The existing slider auto-rotates every 5 seconds
with no pause control, which fails WCAG 2.2 SC 2.2.2 (moving content lasting more than five seconds
needs a mechanism to pause, stop or hide). Since P7 closeout put `jsx-a11y` at `error`, shipping that
behaviour into a new component would be knowingly re-introducing a defect the phase before this one
existed to remove. The carousel therefore either does not auto-rotate, or carries a visible pause
control. `jsx-a11y/alt-text` at `error` also means an `<img>` without `alt` fails `npm run lint` —
hence `altText`, required whenever `imageKey` is set.

**Repository placement follows the rule this repo has already paid for.**
`lib/repositories/promotions.ts` holds pure functions taking `prisma` and `vendorId` as explicit
parameters and reading no request context — that is what lets a plain `tsx` script exercise them.
The request-scoped accessor lives in a sibling `lib/promotions-service.ts`, matching
`lib/data-rights-service.ts` and `lib/auth-rbac.ts`. It does **not** go in the repository file:
`tests/repository-vendor-scoping.test.ts` allowlists exactly nine legacy facades by name (#252), and
this slice adds no tenth.

### 3. Colour (#255)

A new zero-import module `lib/color-contrast.ts` provides `clampForContrast(fg, backgrounds,
minRatio)`: convert sRGB to OKLCH, reduce lightness until the colour clears the ratio against
**every** listed background, preserve hue and chroma. `brandStyle()` then re-declares
`--color-action`, `--color-accent`, `--color-danger`, `--color-action-hover`, `--color-accent-hover`
and `--color-primary` from each vendor's own primitives, each through the clamp.

## Why a clamp, and why it is load-bearing rather than a safety net

Contrast measured at `/propose`, against white:

```
platform --color-action  #2e7d32   5.13:1  PASS   (audited, P7 closeout)
platform --color-accent  #a85400   5.34:1  PASS
platform --color-danger  #c82d2d   5.43:1  PASS

SriMart RAW action       #1e88e5   3.68:1  FAIL   <- the only per-vendor failure today
SriMart RAW accent       #8e24aa   7.04:1  PASS
SriMart RAW danger       #c62828   5.62:1  PASS

Aheed  RAW action        #4caf50   2.78:1  FAIL   <- Aheed's OWN primitives
Aheed  RAW accent        #f57c00   2.70:1  FAIL      fail hardest of anything measured

Aheed  --color-primary   #1b5e20   7.87:1  PASS  (white text: header banner + hero panel)
SriMart --color-primary  #0d47a1   8.63:1  PASS
```

Two things follow. First, the naive version of this slice — restoring per-vendor derivation without a
clamp — re-breaks **Aheed**, whose raw green and orange fail worse than SriMart's blue. The clamp is
not defensive plumbing around an edge case; it is the only reason this change is safe for the vendor
that has been live longest. Second, `--color-primary` is brought in scope even though both vendors
pass it comfortably today: it is still re-declared per vendor, carries white text in the header banner
and hero panel, and is the last per-vendor token with no guarantee attached. Covering it costs one
more call to a function this slice is already writing.

`--color-primary` is clamped against white **and** the vendor's own `cream` and three tint
primitives, because it renders on all of them (`bg-action-tint text-primary` in the trust strip). The
tints themselves stay plain per-vendor aliases.

## Deliberately excluded

- **Any admin UI** for promotions, banner copy or hero subtitle. Branding and promos are seed/DB
  driven; there is no `/staff/branding` or `/staff/promotions` page and building one is its own slice.
  This is the single largest thing this slice does not do, and the most likely to be asked for next.
- **Date-based promo scheduling** (`startsAt`/`endsAt`). `isActive` is a manual boolean here. The 1:N
  table is chosen partly so scheduling is an additive migration later rather than a remodel.
- **Any link between `VendorPromotion` and the discounts engine.** `linkUrl` is a navigation target,
  not a discount reference; a promo does not create, validate or apply a code.
- **Promo artwork upload.** `imageKey` seeds `null` for both vendors; P6b2's product-image path is not
  being generalised here.
- **`next/image`** — still #46; the promo image is a plain `<img>` like every other storefront image.
- **Theme catalogue (#75)** — stays in P8. Once the clamp carries the AA guarantee, a catalogue of
  pre-audited themes is additive convenience rather than the mechanism.
- **The three semantic tints and `--color-surface-muted`** — they stay plain per-vendor aliases. Their
  current pairings pass (7.00:1 and 7.56:1 primary-on-tint) and clamping them would change
  backgrounds rather than foregrounds, a different transform with different failure modes.
- **Re-auditing `tokens.css`.** Audited in #251, unchanged here, still guarded by its own test.

## Standing decisions this slice changes

Both must be updated on this branch — a future session reads the persistent doc, not this folder:

- **ADR-004 decision 5** states that per-vendor primitives are injected and "the **semantic** layer
  and every component stay unchanged." After this slice the semantic layer is *derived* per vendor.
  Amend it rather than contradict it silently.
- **`specs/design-system.md`** says **"Do not 'restore' the brand hex into the semantic layer."** That
  rule stays true — a clamped value is not the brand hex — but the wording cannot distinguish the two
  as written, and a reader applying it literally would reject this slice. It must name the
  distinction: raw brand hex still forbidden; a value derived through `clampForContrast` is the
  mechanism.
- **`lib/vendor-theme.ts`'s doc comment** argues at length that the three semantic base colours are
  *not* re-declared. It is the best explanation of the specificity trap in the repo and must survive —
  but its conclusion is now wrong and has to be rewritten, not deleted.

## Open items carried forward

- **Admin management of promotions** — without it, a vendor cannot add or retire an offer without a
  DB write. To be filed at `/build-notes`; the most likely immediate follow-up.
- **Promo artwork for both vendors** — the column ships empty by design. Needs assets from the owner;
  related to **#244** (missing production logo object), since both are "a row points at an object
  nobody uploaded".
- **Date-based scheduling** — excluded above; worth an issue so the manual `isActive` boolean is a
  recorded decision rather than an oversight.
- **Per-vendor tint/background contrast** — if a future vendor picks a dark `cream`, `text-primary` on
  `--color-surface-muted` could breach with nothing to catch it.
- **The roadmap row for PR #275** (P7.5b's promotion to production) rides this branch per the
  carry-forward pattern in #144 — `staging` takes no direct pushes, so it has nowhere else to go.
