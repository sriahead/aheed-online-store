---
id: p1083-collection-minimum-banner-headline-plan
title: "P10 #1083/#1078/#1079 — Collection minimum, editable banner headline, honest referral copy (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-13
visibility: internal
summary: "Click & Collect gets its own vendor minimum (default none), the header banner headline becomes vendor-editable, and the referral copy stops promising a first-order rule. One additive migration."
tags: [p10, delivery, collection, storefront, branding, referrals, copy]
related: [user-testing-feedback-2026-10-13, admin-tabs-guide]
---

# P10 #1083/#1078/#1079 — Collection minimum, editable banner headline, honest referral copy (plan)

Three items from the owner's 2026-10-13 user-testing pass
(`docs/business-analysis/user-testing-feedback-2026-10-13.md`, items 3, 9 and 13) that could not
ride `#1077` because two of them need a column. They share one additive migration on `VendorConfig`
and one staff page (`/staff/storefront`).

**Goal:** stop production refusing Click & Collect baskets below the delivery minimum, let a vendor
write its own banner headline without a deploy, and remove the last referral copy that promises a
rule the code does not enforce.

## Gate 1 rulings (owner, 2026-10-13, recorded on #1083 and #1078)

1. **`collectionMinimumOrderPence Int @default(0)`, where `0` means no collection minimum.** This is
   the same convention `minimumOrderPence` already uses. The production defect clears when the deploy
   lands, with no admin action. The rejected alternative, a nullable column where `null` inherits the
   delivery minimum, would have left production broken until someone typed £0, and would have added
   a third meaning ("blank = same as delivery") to explain on the form.
2. **`bannerHeadline String?`, where blank keeps today's derived line.** The derived line (the
   vendor's name, "local delivery across" its locality, and "& click and collect" when collection is
   offered) is built only from the vendor's own data, so it is not platform-written marketing copy and
   the `#239` rule ("null hides") does not apply to it. The rejected alternative, "blank hides", would
   have removed the headline for both vendors on deploy.

## Scope (this slice)

### #1083 — collection minimum

- **The defect.** `resolveDeliveryRules(…, "COLLECTION")` (`lib/delivery-pricing.ts`) returns the
  vendor-wide defaults, so a collection basket is held to the delivery minimum:
  `fulfilmentProgress` (`lib/cart-rules.ts`) reports `below-minimum` and `placeOrder`
  (`lib/repositories/orders.ts`) throws `BELOW_MINIMUM`.
- **The fix is in one function.** Every surface that shows or enforces a minimum reads
  `resolveDeliveryRules`: `getShopperDeliveryRules` (header cart drawer, `/cart`, `/checkout`, the
  checkout preview, the landing page), `features/checkout/place-order.ts` (which passes the
  `VendorProfile` directly as `vendorDefaults`), and `lib/help-facts.ts` (`/help` and the help
  assistant). `resolveDeliveryRules`' `vendorDefaults` parameter gains a **required**
  `collectionMinimumOrderPence`, so `typecheck` finds every caller. For `COLLECTION` it returns that
  value as `minimumOrderPence`. The fee and the threshold returned for `COLLECTION` stay as they are
  (`computeTotals` already charges no fee on collection).
- `/help` and the assistant need no copy change. Both already branch on
  `collectionMinimumOrderPence > 0` and say "There is no minimum for collection orders" at `0`.
- **The staff field.** In the delivery-rules form on `/staff/storefront`, inside the existing
  "Offer Click & Collect" block, add **Collection minimum order (£)**. It is parsed by
  `parseDeliveryRules` with the same pounds rules as the other three. It is required while collection
  is ticked, and `0.00` means no minimum. While collection is unticked the field is not rendered, and
  the stored value is left alone. This is the "written only when supplied" pattern `#634` uses in
  `updateVendorConfig`.
- **Two wording consequences.** Once the minimum is no longer universal, two claims become false for
  a collection shopper, so this slice corrects them:
  - the landing-page hero badge reading "£X minimum order" becomes "£X minimum delivery order";
  - the staff label "Minimum order (£)" becomes "Minimum delivery order (£)", with help text saying
    it does not apply to collection.
- **The operator guide.** `docs/store-admin-guide/admin-tabs-guide.md` documents the new field. Its
  delivery-areas section says "Click & Collect always uses the store defaults", which becomes untrue
  for the minimum, so that sentence is corrected too.
- **No `quotedDeliveryRules` change.** `place-order` checks the quote only on the `DELIVERY` path.
  A collection order re-resolves from the profile and is never quote-checked, so the change cannot
  cause a quote mismatch.

### #1078 — vendor-editable banner headline

- `components/layout/Header.tsx` renders `profile.bannerHeadline` in place of the derived template
  when it is non-null, and the derived template, unchanged, when it is null.
- The field sits on `/staff/storefront` beside **Banner Note** and is submitted with it. It is
  parsed in `parseBrandColourForm` (`lib/brand-colour-form.ts`), which already parses `bannerNote`,
  `heroSubtitle` and `searchPlaceholder`. The value is trimmed, blank becomes `null`, and anything
  over **120 characters** is refused with a field error, as `searchPlaceholder` is refused today. It is
  plain text: no placeholder tokens are substituted, because a vendor that wants its name in the line
  types it.
- The input's placeholder is neutral (CLAUDE.md "User-facing copy"): it describes the fallback rather
  than giving an example headline, because an example would name a vendor or a trade.

### #1079 — honest referral copy

- `components/rewards/WaysToEarnAccordion.tsx` says a referred friend "places their qualifying first
  order". Neither part is a rule: the real rule is a minimum spend (`MIN_REFERRAL_ORDER_PENCE`, £20)
  and one use per friend (`maxPerCustomer: 1`), on any order. It is reworded to the same facts
  `ReferralCard` states since `#1077`: the friend gets the discount on an order at or over the
  minimum, and the referrer earns the bonus points when that order is confirmed. Both amounts are
  formatted from the constants in `lib/referrals.ts`, never written as literals.
- **Widened at Spec, flagged for approval.** Searching for the same claim found it in three more
  strings that reach a shopper's friends: `buildShareLinks`' share message and email body in
  `lib/referrals.ts`, and the `navigator.share` text in `components/rewards/ReferralCard.tsx`. All
  three promise the discount "off your first order". These are the same defect `#1079` names, in copy
  that leaves the site, so they are reworded to "off an order of £X or more", again from the
  constants.

## Deliberately excluded

- **Pack B** (`#1065` referral-cookie consent, `#1080` `aheed_` storage keys, `#1066` live
  `Set-Cookie` check). These need an owner PECR decision and a cookie-rename transition. They are
  separate work.
- **A per-area collection minimum.** Collection is not per-area, and that stays so.
- **A collection fee or a collection free-delivery threshold.** Neither exists as a concept, and the
  fields `resolveDeliveryRules` returns for `COLLECTION` keep their current values.
- **A server-side cap on the delivery minimum versus the collection minimum** (for example, refusing
  a collection minimum above the delivery minimum). Both are the vendor's own business choice.
- **Placeholder tokens in the banner headline** (a name token, for example). Plain text only.
- **Hiding the headline.** A vendor cannot blank the line entirely, because blank means "use the
  derived line". Nobody has asked to hide it, and adding that would need a third state.
- **Backfilling a production value.** The `0` default is the owner's intended value for every
  vendor, so no data change is made. SriMart does not offer collection, so the column has no effect
  there.
- **`#1077`'s unproven logo and favicon checks.** They belong to that slice's promotion, not this one.

## Open items carried forward

- None that block this slice. `#1077` (PR #1081) is already on `staging` and not yet in production,
  so the next `staging` → `main` promotion will carry both slices unless `#1077` is promoted first.
  That is a `/ship` decision.
