---
id: p1077-quick-ui-copy-fixes
title: "P10 — Eleven quick UI and copy fixes from the 2026-10-13 user-testing pass (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-13
visibility: internal
summary: "Eleven single-file UI and copy defects from the owner's 2026-10-13 testing pass — header logo on phones, a banner phone number, a carousel pause control that cannot resume, shop-list affordances and four rewards claims the code does not back."
tags: [p10, ui, copy, rewards, header, carousel, shopping-list, user-testing]
related: [user-testing-feedback-2026-10-13, gap-register-audit]
---

# P10 — Eleven quick UI and copy fixes from the 2026-10-13 user-testing pass (plan)

**Closes #1077.**

**Goal:** clear eleven defects the owner found in one testing pass, each confined to a single
component, so the storefront's first impression stops contradicting itself before the store opens.
Four of the eleven are claims the code does not back — a tier-boost line that never renders, a
singular "point", an undefined "qualifying" order and two fabricated reward thresholds — and those
are the reason this is a slice rather than a tidy-up: they are the same defect class as `#239`,
stated to shoppers rather than to developers.

The evidence for every item, including the live production measurements taken while triaging, is
`docs/business-analysis/user-testing-feedback-2026-10-13.md` (committed on this branch as `7bee5ad`).
That document also records which of the owner's original 21 observations turned out to be already
shipped, so this plan does not re-argue them.

## Scope (this slice)

### Header brand — the full logo on a phone (triage item 1a)

`components/layout/HeaderBrand.tsx` currently renders a vendor's square mark below the `md`
breakpoint and swaps in the logo from `md`, as one `picture` element with a media `source`. The owner
found the mark too small to identify the store on a phone.

The fix **deletes that branch** rather than adjusting it: a vendor with a logo renders the logo at
every width, which is exactly what the logo-only branch immediately below already does. So the
change collapses two branches into one and the component loses its only use of
`ImageWithFallback`'s `sources` prop.

The box is `72x40` below `md` (`h-10 w-auto aspect-9/5`), rising to `128x64` from `md` — unchanged
from what logo-only vendors already render in production. A larger phone box was considered and
rejected at Propose: `72x40` needs no re-measurement, whereas `#655` measured the logo-less wordmark
overflowing a 360px header by 22px, so the width budget at that breakpoint is known to be tight.

**This reverses a decision taken one day earlier in `#1069`.** That is deliberate and owner-driven,
not an oversight, and `#1069`'s build notes are updated to say so — two live decisions pointing in
opposite directions is the thing worth avoiding, not the reversal itself.

The mark keeps every other job it has. `app/favicon.ico/route.ts`, `app/layout.tsx` and
`app/manifest.ts` each read `markStorageKey` independently of the header, so none of them is touched,
and `HeaderBrand` still renders the mark inside the 40x40 tile for a **logo-less** vendor.

### Header banner — the store's phone number (triage item 2)

The banner carries no phone number. `VendorConfig.contactPhone` already exists (`#1055`), is already
editable at `/staff/storefront`, and is already populated in production — only the rendering is
missing.

It renders in the banner's right-hand cluster beside the Help Guide link, as a `tel:` anchor,
**at every width**. Hiding it below `md` like `bannerNote` was rejected at Propose: a phone number is
least useful on the one device that can dial it. The banner already sets `flex-wrap`, so a narrow
phone wraps to a second line instead of overflowing, and the banner is one of the two header rows
`#960` deliberately left scrollable rather than sticky — so a second line costs no pinned height.

A `null` `contactPhone` renders nothing, the `#239` rule the rest of that banner already follows.

### Department carousel — a pause control that can resume (triage items 11a, 11b)

`components/layout/DepartmentHero.tsx` holds two independent pause signals: `paused`, the explicit
control, and `interactionPaused`, latched by `onMouseEnter`/`onFocus` on the carousel region. The
control sits **inside** that region, so on any pointer device the act of reaching for it latches
`interactionPaused`, and rotation cannot resume while the pointer remains. The owner's report that
the control "doesn't seem to do anything" is exactly this: Pause appears to do nothing because hover
already stopped rotation, and Play cannot undo a hover that is still happening.

The fix makes the two signals a single resolved decision in which an **explicit** choice wins:
once the shopper has pressed the control, their choice governs, and hover only pauses while no
explicit choice has been made. Hover-to-pause therefore survives for a shopper who never touches the
control, which is the behaviour `#356` wanted.

`ROTATE_MS` drops from 6000 to 4000, the owner's second request in the same item.

WCAG SC 2.2.2 compliance is unchanged and is the reason the control exists: it keeps its accessible
name, and `prefers-reduced-motion` still pauses at mount. Reduced motion is checked **before** the
explicit-choice rule, so this slice cannot make a reduced-motion visitor's carousel start moving.

### Shop your list — three affordances (triage items 18, 19, 20)

- **The textarea placeholder reads as real content.** It renders in `text-primary-muted`
  (`#49784e`), a saturated dark green, and the placeholder is a worked three-line example list
  (`lib/shopping-list-examples.ts`), so a shopper reasonably believes a list is already there. A
  neutral low-contrast placeholder fixes it. **`design-system/tokens/tokens.css` must not be the
  place this is fixed:** `brandStyle()` injects competing custom properties inline and inline beats
  `:root`, so a token edit may never reach a browser — CLAUDE.md's design-token rule.
- **The quantities hint sits below the textarea**, where it is read after the shopper has already
  typed. It moves above.
- **The ambiguous-line `select` offers "Skip this line" as its first option**, which does not say
  that a choice is wanted. It is reworded to name both the choice and the skip. The option keeps
  `value=""`: that empty value *is* the skip, which `features/cart/add-list-to-cart.ts` reads
  positionally, so changing it would silently drop lines.

### Rewards — four claims the code does not back (triage items 12a, 12b, 13, 15)

- **The tier-boost line is dead in the rewards panel.** `WaysToEarnAccordion` renders it only when
  `maxMultiplier > 1`, and `RewardsPanel` never passes `maxMultiplier` at all, so it defaults to `1`
  and the line never appears — while `/account/loyalty`, which does pass it, shows it. **This is not
  the one-line prop pass the issue body describes**, found during this spec's own grounding:
  `RewardsData` has no `maxMultiplier` field, so the value has to come from
  `lib/rewards-service.ts`. That file already fetches `tiers` in its signed-in branch, so this costs
  **no new query** — it is one computed line plus a field on the type. The signed-out branch returns
  before `tiers` is fetched and gets `1`, which correctly keeps the line hidden rather than paying a
  query for a visitor who has no tier.
- **"Earn 1 point for every £1" is hardcoded singular**, so any vendor earning more than one point
  per pound reads wrong. It pluralises off the same value it already interpolates.
- **The referral copy says "their qualifying first order" and never says what qualifies.** The
  threshold is real and enforced: `MIN_REFERRAL_ORDER_PENCE` (£20) is written as the referral
  `DiscountCode.minSubtotalPence` in `lib/repositories/referral-codes.ts:64`, so the friend's £5 is
  refused below £20 — and because the referrer's 100 points are awarded only when a referral
  `DiscountRedemption` exists on the order (`lib/repositories/orders.ts:1789-1798`), **both** halves
  of the offer depend on that same £20. The copy states it.
- **Two of the three "available rewards" are fabricated.** `AvailableRewardsSection` hardcodes
  500-point and 1000-point thresholds that are not vendor data at all, and the section calls them
  vouchers when no voucher exists — redemption is a points field at checkout. Every threshold
  becomes a multiple of the vendor's own `minRedeemPoints` (1x, 2x, 5x) and the copy stops promising
  a voucher. A vendor with `minRedeemPoints` of `0` has no threshold to show and gets no section,
  the same `#239` null-hides rule used elsewhere in this slice.

## Deliberately excluded

Everything below came out of the same feedback pass and is **not** in this slice. Each is recorded
in `docs/business-analysis/user-testing-feedback-2026-10-13.md` with its evidence.

- **Triage item 3, simplifying the banner wording — now `#1078`.** The owner chose at Propose to
  make that line vendor-editable rather than reworded in code, which needs an additive migration and
  a staff form field. It is the one item that left this slice *because of* a Propose decision rather
  than on size.
- **Triage item 4** — a deliverable postcode does not select Delivery. Needs intent plumbing through
  the postcode modal and partially reverses a `#748` rule.
- **Triage item 9 (collection)** — the £15 minimum is applied to Click & Collect, confirmed live.
  Needs a new `VendorConfig` column.
- **Triage item 21** — no warning when an ambiguous shop-list line is left unselected. Needs a
  skipped-lines report threaded through `features/cart/add-list-to-cart.ts`, which this slice only
  reads.
- **Triage item 1b** — grouping the 24 flat staff-nav links. Three test-enforced surfaces.
- **Triage item 10** — `listCategorySpotlights`' take window is global, so one department can starve
  the rest of spotlights.
- **Triage item 6** — the privacy page's `code`-styled cookie names, and the four platform-wide
  `aheed_`-prefixed storage keys that publish one vendor's name on another vendor's privacy page.
  The rename is not cosmetic: it would drop every live cart and consent record.
- **Triage items 7, 8, 16, 17** — `#104`/`#113` (owner-gated, external), the Google OAuth console,
  an unreproduced greyed control, and refunds (`#606`).
- **`#1034`** — `getRewardsDataForUser` runs loyalty reads and creates a referral code on every
  signed-in render even for a loyalty-off vendor. This slice edits that function and does not fix
  that; it adds no query, so it does not worsen it either.
- **Making the referral economics vendor data.** `REFERRAL_DISCOUNT_PENCE`, `REFERRAL_REWARD_POINTS`
  and `MIN_REFERRAL_ORDER_PENCE` stay platform constants in `lib/referrals.ts`. This slice makes the
  copy *honest* about them; making them *configurable* is a schema change and contradicts nothing
  until someone asks for a per-vendor referral offer.
- **The "first order" imprecision.** The referral code carries `maxPerCustomer: 1`, not a
  first-order restriction, so a friend could use it on a later order. The sentence being edited for
  item 13 says "first order". It is reworded to match what the code enforces, because leaving a
  known-false clause inside the very sentence this slice edits for honesty would be indefensible —
  flagged here as an addition beyond the literal wording of triage item 13.

## Open items carried forward

- **`#1078`** — the vendor-editable banner headline (triage item 3). Spec must settle whether it is
  a new column or a promotion of `bannerNote`; `VendorBranding.tagline` is **not** available, as it
  already drives the landing hero's heading and the page metadata.
- **`ImageWithFallback`'s `sources` prop becomes unused** once item 1a lands. It stays: it is a
  generic primitive and `#1072` (a footer logo with a light-on-dark variant) is the obvious next
  caller. Noted so a future reader does not read it as dead code left by accident.
