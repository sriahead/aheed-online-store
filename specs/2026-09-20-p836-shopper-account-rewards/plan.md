---
id: p836-shopper-account-rewards
title: "P836 — Shopper Account Upgrade & Loyalty/Rewards Integration (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-20
visibility: internal
summary: Upgrade the Shopper "Your account" experience to match the Staff View card layout, integrate the Loyalty & Rewards interaction, add a floating Rewards launcher with slide-out panel, and provide a customer referral system.
tags: [account, storefront, loyalty, rewards, referrals, staff-view, ui]
related: [p5a-loyalty-points, p5b-discount-codes, p6a-admin-shell-orders]
---

# P836 — Shopper Account Upgrade & Loyalty/Rewards Integration (plan)

## Goal

Upgrade the Demo/Shopper "Your account" experience to visually match the Staff View / Store Admin layout (full-width structure, responsive 2-column card grid, identical border and hover styling), integrate the Loyalty & Rewards interaction into the account, add a persistent floating Rewards launcher with a compact slide-out panel matching the provided reference widget, and establish customer referral link sharing and tracking.

## Scope (this slice)

- **Shopper Account Hub (`app/(storefront)/account/page.tsx`)**:
  - Adopt full-width container structure (`max-w-5xl px-4 py-8`) and align title/subtitle with Store Admin.
  - Present customer Name, Email, and Role in a clean surface card.
  - Replace vertical links with a responsive card grid (2-column on desktop, single-column on mobile).
  - Cards for Orders, Lists, Loyalty & Rewards, Feedback, and Data Rights, matching Staff View card styles (`rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block`).
  - Keep Logout button accessible below the cards with a separator.
- **Loyalty & Rewards Page (`app/(storefront)/account/loyalty/page.tsx`)**:
  - Upgrade page layout to `max-w-5xl` with back button to `/account`.
  - Hero card displaying current points balance, cash value off next order, expiration date (if inactivity expiry applies), current tier, and next tier spend progress.
  - Expandable/collapsible accordions for "Ways to earn" and "Ways to redeem".
  - Available rewards voucher tier cards (£1, £5, £10 off) with unlock progress bars.
  - Referral card with unique customer link, copy button, status count, and social share buttons.
  - Retain full transaction ledger for points history.
- **Floating Rewards Launcher & Slide-out Panel**:
  - `components/rewards/RewardsLauncher.tsx`: Floating pill button at `bottom-6 left-6` (`sm:bottom-8 sm:left-8`), toggling to close state when active.
  - `components/rewards/RewardsPanel.tsx`: Compact slide-out panel matching reference with vibrant brand header, points, expiry, accordions, and referral card.
  - Capture incoming `?ref=...` query param on storefront visits and persist in `aheed_referral_code` cookie.
  - Mount launcher globally in `components/layout/StorefrontChrome.tsx`.
- **Referral Subsystem (`lib/referrals.ts`, `lib/referrals-service.ts`)**:
  - Pure deterministic referral code generator (`REF-XXXXXXXX`), link builder (`/?ref=...`), self-referral detection, and social share links.
  - Request-scoped service counting completed referrals via discount redemptions and ensuring discount codes exist.
  - Single shared API endpoint (`app/api/rewards/route.ts`) serving both the account page and the floating panel.
- **Automated Tests**:
  - `tests/referrals.test.ts`: Pure unit tests for referral codes, URLs, self-referral checks, and share links.
  - `tests/rewards-components.test.tsx`: Component tests for accordions, available vouchers, referral card, and rewards panel.

## Deliberately Excluded

- **Changes to points earning/redemption calculations**: Existing pure loyalty math remains completely untouched.
- **Database schema migrations**: Utilizes existing `DiscountCode` and `DiscountRedemption` models without schema modifications.

## Open Items Carried Forward

- None for this slice.
