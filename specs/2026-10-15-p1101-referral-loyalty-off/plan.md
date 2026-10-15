---
id: p1101-referral-loyalty-off
title: "A loyalty-off vendor stops running a referral scheme (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-15
visibility: internal
summary: "With loyalty switched off, a vendor creates no referral codes, refuses existing ones at checkout and pays no referral bonus. Also fixes the signed-out referral box that rendered greyed out (triage item 16) and drops a leftover voucher promise."
tags: [rewards, referrals, loyalty, checkout, discounts, accessibility, p10, user-testing]
related: [user-testing-feedback-2026-10-13, app-conventions, store-admin-tabs-guide]
---

# A loyalty-off vendor stops running a referral scheme (plan)

Closes `#1101` and `#1034`. Approved at Gate 1 on 2026-10-15, including the owner's decision that a
referral code is **refused** at checkout on a loyalty-off vendor rather than honoured.

**Goal:** `VendorConfig.loyaltyEnabled = false` has to mean the referral scheme is off at every point
where it can act: creating a code, accepting one at checkout, and paying the referrer. Today it only
hides the UI (`#1023`). Underneath, the scheme keeps running for a vendor that never offered it. That
is the `#239` defect class, the platform making an offer on a vendor's behalf, except here it moves
real money. The slice also clears two small shopper-facing defects in the same rewards components.

## The defect, at each of the three points

The scheme can act in three places, and today none of them reads `loyaltyEnabled`.

1. **Creation (`#1034`).** `lib/rewards-service.ts` `getRewardsDataForUser` runs for every signed-in
   render. Its callers are `components/layout/StorefrontChrome.tsx` and `app/api/rewards/route.ts`.
   Its signed-in branch runs `loyalty.balance`, `loyalty.tiers`, `loyalty.windowSpend` and
   `getReferralStats` in a `Promise.all`. `getReferralStats` (`lib/referrals-service.ts`) calls
   `getOrCreateReferralCode`, which since `#991` **creates** a `DiscountCode` row whose
   `referrerUserId` is the shopper. So every signed-in shopper on a loyalty-off vendor gets a live,
   redeemable £5 code, and every page view costs four reads whose results are thrown away. The
   chrome renders the launcher only when `loyaltyEnabled` is true.
2. **Redemption (new at triage).** `previewCode` in `lib/repositories/discounts.ts` accepts any
   matching code, and `claimCode` delegates to it (`#967`). Neither distinguishes a referral code on
   a vendor whose scheme is off. Before `#1023` (2026-10-11) SriMart's launcher was visible, so codes
   could have been shared.
3. **Payout (new at triage).** `confirmPayment` (`lib/repositories/orders.ts`, around line 1786)
   calls `awardReferralBonusPoints` whenever the order redeemed a referral code. The earn path just
   above it checks `loyaltyConfig.loyaltyEnabled`; the payout doesn't, so a loyalty-off vendor credits
   points in a scheme it doesn't run.

Measured on the dev database (`ep-dry-morning`) at Spec, 2026-10-15: `srimart` has
`loyaltyEnabled = false` and **0** referral codes, and `aheed-food-centre` has `loyaltyEnabled = true`
and 2. Production has not been measured, because auto mode can't read it (see Open items).

## Scope (this slice)

### Creation: `getRewardsDataForUser` returns early

When the vendor's `loyaltyEnabled` is false, the function returns straight after reading the config.
It does not call `loyalty.balance`, `loyalty.tiers`, `loyalty.windowSpend` or `getReferralStats`.
The result is the same shape the signed-out branch returns: zero balance, `null` tier, `null`
expiry, `maxMultiplier: 1`, an empty `referralCode` and `referralUrl`, and `referralsCompleted: 0`.
The one difference is that `authenticated` reflects whether a `userId` was given. That keeps the
field honest for a caller that reads it, while no code is created.

The check goes in the service, not in `getReferralStats` or the repository. That way both callers
(`StorefrontChrome`, `/api/rewards`) are covered by one edit, and the loyalty reads are skipped too,
not only the code creation. `getReferralStats` stays as it is: its other caller, `/account/loyalty`,
already 404s when loyalty is off (`page.tsx`, `if (!config.loyaltyEnabled) notFound()`).

### Redemption: a new refusal reason

`previewCode` refuses a code whose `referrerUserId` is non-null when the vendor's loyalty is off. It
returns `{ ok: false, reason: "REFERRALS_UNAVAILABLE" }`. Details:

- **Where.** Directly after the `!row` / `UNKNOWN` return and before the `OWN_REFERRAL_CODE` check.
  When the scheme is off, nothing about the shopper, including whether the code is their own, can
  make the code usable, so this reason outranks every other one. That follows the precedence
  reasoning the `#972` comment already uses.
- **How the flag is read.** Inside the repository, with the client and `vendorId` it was given:
  `getLoyaltyConfig(db, vendorId)` from `lib/repositories/loyalty.ts`. This satisfies both
  repository tests (`tests/repository-purity.test.ts`, `tests/repository-client-injection.test.ts`)
  with no new parameter on either export. It is read **only** when the row's `referrerUserId` is
  non-null, so a staff-created code costs no extra query. Inside `claimCode`'s interactive
  transaction it is one more read on the same `tx`, which is fine.
- `getLoyaltyConfig` falls back to `LOYALTY_CONFIG_FALLBACK` (`loyaltyEnabled: false`) when a
  vendor has no config row. A vendor with no config therefore also refuses referral codes, which is
  consistent with the creation gate.
- **The type.** `REFERRALS_UNAVAILABLE` is added to `CodeRefusalReason` in `lib/discounts.ts`.
  `refusalMessage` returns `"Referral codes can't be used at this store right now."`. The message is
  vendor-neutral and names no vendor.
- **The throttle.** The `#988` unknown-code throttle counts only `UNKNOWN` refusals
  (`features/checkout/place-order.ts`, `lib/checkout-preview-service.ts`). This code exists, so its
  refusal does not count as an attempt, and no change is needed there.
- **The checkout pre-fill.** It reads the referral cookie through `previewCode` (`#967`), so it now
  shows the same message for a referral code on a loyalty-off vendor. That's intended. Little can
  reach it in practice: the cookie is written only by `RewardsLauncher`, which a loyalty-off vendor
  never renders.

### Payout: `referralBonusRecipient` takes the flag

The decision "who earns the referral bonus" already lives in the pure function
`referralBonusRecipient` (`lib/referrals.ts`). It gains a **required** third parameter,
`loyaltyEnabled: boolean`, and returns `null` when that is false. `confirmPayment` passes
`loyaltyConfig.loyaltyEnabled`, which it has already read. The parameter is required rather than
optional so that a future call site can't get the old ungated behaviour by default (the same
reasoning as `#1077`'s required `maxMultiplier`).

This puts the gate where it is unit-testable (`tests/referrals.test.ts`). `confirmPayment` itself has
no referral-payout test, and building one is out of proportion for a one-argument change. With
redemption now refused, the payout gate is defence in depth. It still matters for a code redeemed
**before** the vendor switched loyalty off and confirmed after: the order is paid with the discount
already applied, and the bonus isn't.

### Item 16: the signed-out referral box follows `variant`

`components/rewards/ReferralCard.tsx`'s signed-out branch hardcodes `bg-black/20` and
`text-stone-300`. Its only two callers, `RewardsPanel` and `/account/loyalty`, both pass
`variant="light"` on a white card, so it renders pale grey on light grey, about 1.05:1, which reads as
a disabled control. That is the owner's "refer a friend CTA button is greyed" (triage item 16, still
unconfirmed by the owner but the only match in the code). The fix makes the box follow `variant` the
way every other branch of the card already does:

- **light:** `bg-surface-muted` with `text-primary`. `brandStyle()` (`lib/vendor-theme.ts`) clamps
  `--color-primary` for AA against white **and** the vendor's cream, and cream is what
  `--color-surface-muted` resolves to. So the pair passes for every vendor by construction, not only
  for the one measured.
- **dark:** unchanged (`bg-black/20`, `text-stone-300`). Nothing renders it today, and that pair is
  correct on a dark card.

No link is added. The signed-out `RewardsPanel` already renders a Sign in link
(`RewardsPanel.tsx`, `href="/login"`), so the box only needs to be legible.

**Second vendor.** CLAUDE.md asks for brand checks against a second vendor. Here SriMart can't show
the box at all (loyalty off, so no launcher), so the second-vendor guarantee is the `brandStyle()`
clamp above. Validation measures the rendered pair on Aheed.

### Copy

- `app/(storefront)/account/loyalty/page.tsx`: the intro line "Earn points on every order you pay
  for, unlock vouchers, and refer friends." becomes "Earn points on every order you pay for, spend
  them at checkout, and refer friends." `#1077` withdrew the voucher promise from
  `AvailableRewardsSection` because no voucher exists: redemption is a points field at checkout. This
  line was the one it missed. The JSX comment naming the rewards section is reworded too, so the file
  no longer says "voucher" at all.
- `components/staff/LoyaltyConfigForm.tsx`: the helper text under "Run a loyalty scheme at this
  store" says turning it off also switches off referrals. Shoppers' referral links stop working and no
  referral bonus is paid. Existing balances and referral codes are kept, not deleted. This is the
  staff-facing half of the same honesty. A store admin who turns loyalty off should learn there that
  shared links will be refused.
- `docs/store-admin-guide/admin-tabs-guide.md`, the Loyalty section: the same fact, so the operator
  guide matches the control (CLAUDE.md: every capability sentence traces to a real control).

## Deliberately excluded

- **Cleaning up loyalty-off referral codes that already exist.** Once redemption is refused they can't
  cost the vendor anything, and switching loyalty back on makes them valid again, which is the right
  outcome for a shopper who was given one. Deleting or deactivating them would be a production data
  change made on an unmeasured count.
- **The loyalty-on path.** Aheed still pre-loads rewards data on every signed-in render. That's
  `#836`'s deliberate guard against an unauthenticated flash, and its results are used.
- **Making referral amounts per-vendor** (triage 12.1). The amounts stay as constants in
  `lib/referrals.ts`.
- **The `aheed_referral_code` cookie name** (`#1080`) and **referral-cookie consent** (`#1065`).
  These are the next slice, together.
- **The `dark` variant of the signed-out box.** It's left exactly as it is.
- **A `confirmPayment` integration test for the payout.** The gate is tested at the pure function,
  and its one call site is read at validation.

## Open items carried forward

- **The production count of loyalty-off referral codes.** This needs the owner, because auto mode
  blocks production database reads. If the count is non-zero, deciding whether to deactivate them is a
  separate owner call. This slice makes them inert either way.
- **Triage item 16 is still waiting for the owner to confirm** they were signed out when they saw the
  greyed box. If they were signed in, the cause is somewhere else and the item reopens.
- **`#797`, new evidence from this spec's measurement:** the dev database carries several hundred
  leftover `express-test-*`, `concurrency-test-*` and `test-vendor-*` vendors from live-DB test
  fixtures.
