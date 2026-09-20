# P836 — Shopper Account Upgrade & Loyalty/Rewards Integration (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests.
> - **Build:** Verify card grid layout, profile details, loyalty hero card, accordions, referral sharing, and floating panel.
> - **Validate:** Verify responsive behavior, copy button feedback, drawer dismiss, self-referral protections, and test pass.
> - **Release:** Confirm Gate 3 and Gate 4 compliance across all quality checks.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Layout / CSS | Inspect `app/(storefront)/account/page.tsx` asserting container uses `max-w-5xl px-4 py-8` matching Staff View. |
| R2  | Typography   | Verify "Your account" heading uses `text-2xl font-semibold text-primary` and subtitle uses `text-sm text-primary-muted`. |
| R3  | Profile Card | Verify customer summary card displays Name, Email, and Role in a surface card near top. |
| R4  | Responsive   | Verify card grid uses `grid gap-4 sm:grid-cols-2` (2 columns on desktop, 1 column on mobile). |
| R5  | Cards        | Verify cards exist for Orders, Lists, Loyalty & Rewards, Feedback, and Data. |
| R6  | Parity       | Verify cards carry `rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block`. |
| R7  | Logout       | Verify Logout button is present below the card grid with a border separator. |
| R8  | Loyalty Page | Verify `/account/loyalty` displays points hero card, expiration date, ways to earn/redeem accordions, available vouchers, and referral card. |
| R9  | Floating UI  | Verify floating Rewards launcher is rendered in `StorefrontChrome` at `bottom-6 left-6` and toggles `RewardsPanel`. |
| R10 | Shared Data  | Run `npx vitest run tests/rewards-components.test.tsx` verifying RewardsPanel receives and renders loyalty data from `/api/rewards`. |
| R11 | Referrals    | Run `npx vitest run tests/referrals.test.ts` verifying code generation, URL building, self-referral detection, and share links. |
| R12 | Gate 4       | Verify `CHANGELOG.md` contains an entry for `#836`. |
| R13 | Gate 3       | Run `npm run lint && npm run typecheck && npm run format:check && npx vitest run` and verify all exit 0. |
