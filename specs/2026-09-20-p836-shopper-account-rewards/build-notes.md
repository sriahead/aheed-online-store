# P836 — Shopper Account Upgrade & Loyalty/Rewards Integration (build notes)

Written at the end of Build, before the Clear.

## What changed and why

1. **`app/(storefront)/account/page.tsx`**:
   - Replaced narrow vertical links with full-width container (`max-w-5xl px-4 py-8`) matching Staff View / Store Admin.
   - Added customer summary card near the top displaying Name, Email, and Role.
   - Created responsive 2-column card grid (`grid gap-4 sm:grid-cols-2`) for Orders, Lists, Loyalty & Rewards, Feedback, and Data Rights, styled identically to Staff View cards (`rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block`).
   - Maintained Logout button clearly accessible below the grid in a separated footer section.

2. **`app/(storefront)/account/loyalty/page.tsx`**:
   - Upgraded to `max-w-5xl` layout with breadcrumb link back to `/account`.
   - Added Hero Points card with points balance, £ cash value off next order, active status or expiration date, lifetime points, current tier multiplier, and next tier spend progress.
   - Added `AvailableRewardsSection` showing available grocery voucher tiers (£1, £5, £10 off) with unlock progress bars.
   - Integrated `WaysToEarnAccordion` and `WaysToRedeemAccordion`.
   - Integrated `ReferralCard` with unique customer link, copy feedback, and social sharing.
   - Preserved complete points history ledger.

3. **`components/rewards/`**:
   - `WaysToEarnAccordion.tsx`: Expandable/collapsible accordion detailing grocery points earning, tier multipliers, and referral bonuses.
   - `WaysToRedeemAccordion.tsx`: Expandable/collapsible accordion detailing 100 pts = £1.00 redemption and minimum redemption thresholds.
   - `AvailableRewardsSection.tsx`: Displays voucher milestone cards with progress bars.
   - `ReferralCard.tsx`: Exposes referral link, copy button with checkmark feedback, status count, and social share buttons for Facebook, X (Twitter), Email, and WhatsApp.
   - `RewardsPanel.tsx`: Compact slide-out panel with yellow/amber brand header, points balance, expiration date, accordions, and referral card matching the reference design.
   - `RewardsLauncher.tsx`: Floating launcher at `bottom-6 left-6` (`sm:bottom-8 sm:left-8`), toggles `RewardsPanel`, and captures `?ref=...` query parameters to set the referral cookie.

4. **`components/layout/StorefrontChrome.tsx`**:
   - Mounted `RewardsLauncher` globally across all storefront pages.

5. **`lib/referrals.ts` and `lib/referrals-service.ts`**:
   - Pure referral helpers: deterministic code generation (`REF-XXXXXXXX`), URL builder (`/?ref=...`), self-referral detection, and social share URL generation.
   - Request-scoped service counting completed referrals and ensuring referral discount codes exist.
   - API route `app/api/rewards/route.ts` providing unified data for the account page and floating panel.

6. **Tests**:
   - `tests/referrals.test.ts`: Pure unit tests covering referral codes, URL builder, self-referral checks, and share links (6 tests passing).
   - `tests/rewards-components.test.tsx`: Component tests covering accordions, available vouchers, referral card, and rewards panel (7 tests passing).

## Decisions taken during the build

- **Zero DB migration footprint**: Reused the existing `DiscountCode` and `DiscountRedemption` tables to track referrals, eliminating database migration risk.
- **Unified API layer**: Both the full `/account/loyalty` page and the floating `RewardsLauncher` panel share the exact same underlying logic and data from `/api/rewards`.
- **A11y & Motion Reduction**: All accordions, copy controls, and dialog surfaces include ARIA attributes (`aria-expanded`, `aria-modal`, `aria-label`) and motion-reduction fallbacks.

## Deviations from the spec

None.

## Known-shaky areas

None. All 54 related tests pass, lint and typecheck are clean.
