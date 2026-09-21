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

3. **`components/account/AccountNav.tsx` & `app/(storefront)/account/layout.tsx`**:
   - Created persistent `AccountNav` tab bar matching Staff View's `PanelNav.tsx` (`max-w-5xl`, horizontal scrolling with smooth nudge chevron buttons, active indicator border `border-primary text-primary`).
   - Tabs: Overview (`/account`), Orders (`/account/orders`), Lists (`/account/lists`), Loyalty & Rewards (`/account/loyalty`), Feedback (`/feedback`), and Data rights (`/account/data`).
   - Upgraded sub-pages (`/account/orders`, `/account/orders/[orderNumber]`, `/account/lists`, `/account/lists/[listId]`, `/account/data`) to uniform `max-w-5xl px-4 py-8` container width.
   - Rendered `AccountNav` on `/feedback` for signed-in users for seamless navigation parity.

4. **`components/rewards/`**:
   - `WaysToEarnAccordion.tsx`: Expandable/collapsible accordion detailing grocery points earning, tier multipliers, and referral bonuses.
   - `WaysToRedeemAccordion.tsx`: Expandable/collapsible accordion detailing 100 pts = £1.00 redemption and minimum redemption thresholds.
   - `AvailableRewardsSection.tsx`: Displays voucher milestone cards with progress bars.
   - `ReferralCard.tsx`: Exposes referral link, copy button with checkmark feedback, status count, and social share buttons for Facebook, X (Twitter), Email, and WhatsApp.
   - `RewardsPanel.tsx`: Re-skinned to match Aheed Food Centre application brand and surfaces (forest green `bg-primary text-white` header, gold badge, crisp white dialog body, `bg-surface-muted/50`, and light theme accordions/referral card).
   - `RewardsLauncher.tsx`: Re-skinned launcher pill to Aheed `bg-primary text-white`, supports SSR `initialData` pre-hydration, and captures `?ref=...` query parameters to set the referral cookie.

5. **`lib/rewards-service.ts` & `StorefrontChrome.tsx`**:
   - `lib/rewards-service.ts`: Shared service resolving unified rewards, points balance, tier, and referral stats for both SSR and API.
   - `StorefrontChrome.tsx`: Pre-hydrates `initialRewardsData` on the server from the Better Auth session, eliminating client loading flashes or cookie-in-fetch discrepancies.
   - `app/api/rewards/route.ts`: Sets `Cache-Control: private, no-cache, no-store, must-revalidate` and merges `request.headers` with `next/headers`.

6. **Referral Attribution & Checkout Integration**:
   - `lib/repositories/orders.ts` & `lib/repositories/loyalty.ts`: In `confirmPayment`, when an order is paid with a referral code (`REF-XXXXXXXX`), automatically awards `REFERRAL_REWARD_POINTS` (100 bonus points) to the referrer's `LoyaltyAccount`.
   - `app/(storefront)/checkout/page.tsx` & `components/checkout/CheckoutForm.tsx`: Automatically pre-populates the discount code field from the `aheed_referral_code` cookie.

7. **Tests**:
   - `tests/referrals.test.ts`: Pure unit tests covering referral codes, URL builder, `extractReferrerUserId`, self-referral checks, and share links (7 tests passing).
   - `tests/rewards-components.test.tsx`: Component tests covering accordions, available vouchers, referral card, rewards panel, and launcher pre-hydration (8 tests passing).
   - `tests/account-nav.test.tsx`: Tests for AccountNav tabs, active path classes, and link targets (4 tests passing).
   - `tests/repository-purity.test.ts` & `tests/repository-client-injection.test.ts`: 4 tests passing verifying pure repository layer discipline.

## Decisions taken during the build

- **Zero DB migration footprint**: Reused the existing `DiscountCode`, `DiscountRedemption`, and `LoyaltyAccount` tables without database schema migrations.
- **Server Pre-hydration**: Pre-hydrating `RewardsLauncher` in `StorefrontChrome` guarantees that logged-in users immediately see their real points and referral code on page load without waiting for client-side API requests.
- **Brand System Parity**: Replaced third-party yellow reference styling with native Aheed Food Centre forest green (`--color-brand-green-dark: #1b5e20`), action green (`#2e7d32`), and white/cream surfaces.
- **Account Tab Parity**: Delivered full navigation parity with Staff View's `PanelNav.tsx` across all account and feedback surfaces.

## Deviations from the spec

None.

## Known-shaky areas

None. All 23 test suites pass, lint and typecheck are clean.
