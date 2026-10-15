# A loyalty-off vendor stops running a referral scheme (requirements / acceptance criteria)

Closes `#1101` and `#1034`. When `VendorConfig.loyaltyEnabled` is false, the referral scheme stops
acting at all three points: no code is created on render, an existing referral code is refused at
checkout preview and claim, and no referral bonus is paid. It also fixes the greyed-out signed-out
referral box (triage item 16) and drops a leftover voucher promise. No schema change. The reasoning
is in `plan.md`. Below, "a referral code" means a `DiscountCode` row whose `referrerUserId` is
non-null, and "a staff code" means one whose `referrerUserId` is null.

## Creation: `getRewardsDataForUser` (`lib/rewards-service.ts`)

R1. When the vendor's loyalty config has `loyaltyEnabled: false` and a non-null `userId` is passed,
    `getRewardsDataForUser` makes **zero** calls to `loyalty.balance`, `loyalty.tiers`,
    `loyalty.windowSpend` and `getReferralStats`. A new test file `tests/rewards-service.test.ts`
    proves it by mocking `@/lib/loyalty-service` and `@/lib/referrals-service` and asserting each
    mock was not called.

R2. In R1's case, the returned object has `authenticated: true`, `loyaltyEnabled: false`,
    `balancePoints: 0`, `tier: null`, `expiryDate: null`, `maxMultiplier: 1`, `referralCode: ""`,
    `referralUrl: ""` and `referralsCompleted: 0`. Its `pointsPerPoundEarned`,
    `pencePerPointRedeemed` and `minRedeemPoints` equal the config's values. Asserted in
    `tests/rewards-service.test.ts`.

R3. When `loyaltyEnabled: true` and a non-null `userId` is passed, `getRewardsDataForUser` calls
    `getReferralStats` exactly once with that `userId`, and returns `authenticated: true` with the
    `referralCode` the mock returned. This is the regression guard for the loyalty-on vendor.
    Asserted in `tests/rewards-service.test.ts`.

R4. When `userId` is `null`, the result has `authenticated: false` and `getReferralStats` is not
    called, whatever `loyaltyEnabled` is. Both values are asserted in `tests/rewards-service.test.ts`.

R5. **Live, under `npm run preview` against the dev database.** Signing in as
    `demo-customer@example.com` on SriMart's local host (`srimart.localhost:8787`, loyalty off) and
    loading `/`, `/search?q=a` and `/cart` with that session leaves the count of SriMart
    `DiscountCode` rows whose `referrerUserId` is that user's id at **0**. The same sign-in and
    loads on Aheed's local host (`localhost:8787`, loyalty on) leave that user with exactly **1**
    Aheed referral code: the existing one, or one created on the first load, and never a second.

## Redemption: `previewCode` / `claimCode` (`lib/repositories/discounts.ts`, `lib/discounts.ts`)

R6. `CodeRefusalReason` in `lib/discounts.ts` includes `"REFERRALS_UNAVAILABLE"`, and
    `refusalMessage("REFERRALS_UNAVAILABLE")` returns exactly
    `Referral codes can't be used at this store right now.` (with a straight apostrophe, like every
    other message in that switch). The message names no vendor.

R7. `previewCode` returns `{ ok: false, reason: "REFERRALS_UNAVAILABLE" }` for a referral code when
    the vendor's `loyaltyEnabled` is false. That includes the case where the claiming `userId` is
    the code's own `referrerUserId`: this reason outranks `OWN_REFERRAL_CODE`. It also includes the
    case where the code would otherwise pass every other check. Asserted in
    `tests/discounts-preview.test.ts`.

R8. `claimCode` returns `{ ok: false, reason: "REFERRALS_UNAVAILABLE" }` in R7's case and makes no
    `discountCode.updateMany` call, so no redemption is reserved. Asserted in
    `tests/discounts-preview.test.ts` or `tests/discounts-repository.test.ts`.

R9. With `loyaltyEnabled: true`, a referral code that passes every other check still previews `ok`.
    A staff code previews `ok` with `loyaltyEnabled` false **or** true, and for a staff code the
    loyalty config is **not** read at all (`vendorConfig.findUnique` not called by the lookup). All
    three are asserted in `tests/discounts-preview.test.ts`.

R10. `previewCode` reads the loyalty flag through `getLoyaltyConfig(db, vendorId)` from
     `lib/repositories/loyalty.ts`, using the `db` and `vendorId` it was given, and the signatures of
     `previewCode` and `claimCode` are unchanged. `tests/repository-purity.test.ts` and
     `tests/repository-client-injection.test.ts` pass.

R11. A `REFERRALS_UNAVAILABLE` refusal doesn't record an unknown-code throttle attempt.
     `recordCallerUnknownCode` stays reachable only behind `reason === "UNKNOWN"` in both
     `features/checkout/place-order.ts` and `lib/checkout-preview-service.ts`. Verified by reading
     both call sites.

## Payout: `referralBonusRecipient` (`lib/referrals.ts`) and `confirmPayment`

R12. `referralBonusRecipient` takes a third, **required** parameter `loyaltyEnabled: boolean` (not
     optional, no default value). It returns `null` when `loyaltyEnabled` is false, whatever the
     other two arguments are. With `loyaltyEnabled: true` it behaves exactly as before: `null` for
     a missing referrer or a self-referral, otherwise the referrer's id. Asserted in
     `tests/referrals.test.ts`, with the existing cases updated to pass `true`.

R13. The single call to `referralBonusRecipient` in `confirmPayment` (`lib/repositories/orders.ts`)
     passes `loyaltyConfig.loyaltyEnabled` as its third argument, and `referralBonusRecipient` has
     no other call site under `lib/`, `features/` or `app/`.

## Item 16: the signed-out referral box (`components/rewards/ReferralCard.tsx`)

R14. Rendered with `authenticated={false}` and `variant="light"`, the signed-out box (the element
     containing `Sign in to your account to get your unique referral link.`) carries
     `bg-surface-muted` and its text carries `text-primary`. Neither carries `bg-black/20` or
     `text-stone-300`. Rendered with `variant="dark"`, it still carries `bg-black/20` and
     `text-stone-300`. Both are asserted in `tests/rewards-components.test.tsx`.

R15. **Live, under `npm run preview`, Aheed's local host, signed out, in a real browser.** With the
     Rewards panel open, the signed-out referral sentence's computed `color` against its box's
     computed `background-color` has a contrast ratio of **at least 4.5:1**, measured from the
     browser's computed styles and not from the class names.

## Copy

R16. Every match of `voucher` (case-insensitive) in `app/(storefront)/account/loyalty/page.tsx`
     sits inside a JS/JSX comment, and the intro paragraph under the `Loyalty & Rewards` heading
     reads exactly `Earn points on every order you pay for, spend them at checkout, and refer
     friends.`

R17. The helper text under `Run a loyalty scheme at this store` in
     `components/staff/LoyaltyConfigForm.tsx` states that turning loyalty off also switches off
     referrals: shoppers' referral links stop working, no referral bonus is paid, and existing
     balances and referral codes are kept. It names no vendor.

R18. The `## Loyalty — /staff/loyalty` section of `docs/store-admin-guide/admin-tabs-guide.md`
     states the same three facts as R17, in the same section, and the doc's front-matter
     `version` and `updated` are bumped.

## Gates

R19. No schema or migration change: `git diff origin/staging --stat -- prisma/` prints nothing.

R20. `CHANGELOG.md` updated (Gate 4).

R21. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone), `npm run format:check`,
     `npm run build` and `npm run kms:validate` all remain green after this slice. So do
     `npm run kms:assemble:internal` and a real Next build in `kms/site-internal`.
