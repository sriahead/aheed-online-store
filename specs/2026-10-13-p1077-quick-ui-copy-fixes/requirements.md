# P10 — Eleven quick UI and copy fixes from the 2026-10-13 user-testing pass (requirements)

Closes `#1077`. Eleven single-file UI and copy defects from the owner's 2026-10-13 testing pass:
the header logo on phones, a phone number in the banner, a carousel pause control that cannot
resume, three shop-list affordances, and four rewards claims the code does not back. The narrative,
the Propose decisions and the full exclusion list are in `plan.md`; the per-item evidence is in
`docs/business-analysis/user-testing-feedback-2026-10-13.md`. Item numbers in parentheses are that
document's item numbers, kept so a reader can trace a requirement back to the original report.

## Header brand (item 1a)

R1. `components/layout/HeaderBrand.tsx`, rendered with both a `logoUrl` and a `markUrl`, produces
    exactly one `img` element, no `picture` element and no `source` element, with `src` equal to
    `logoUrl` and the class list `h-10 w-auto shrink-0 aspect-9/5 md:h-16 md:aspect-2/1` — byte-for-byte
    the markup the same component produces for a `logoUrl` with a `null` `markUrl`.

R2. `components/layout/HeaderBrand.tsx` rendered with a `markUrl` and a `null` `logoUrl` still
    produces an `img` whose `src` is `markUrl` inside the class list `size-10 shrink-0 rounded-xl
    object-contain` beside the vendor name and locality, and rendered with both `null` still produces
    the initial-letter tile with no `img` element.

R3. `tests/header-brand.test.tsx`'s logo-and-mark case asserts R1 (no `picture`, no `source`, one
    `img`, the logo `src`, the `72x40` box classes) in place of its current assertions about the
    `md` swap, and `npx vitest run tests/header-brand.test.tsx` exits 0 with four passing tests.

R4. `git diff --name-only origin/staging...HEAD` lists none of `app/favicon.ico/route.ts`,
    `app/layout.tsx`, `app/manifest.ts` or `lib/vendor-icons.ts` — the mark keeps every non-header
    job it has.

## Header banner phone number (item 2)

R5. `components/layout/Header.tsx` renders, inside the element carrying `data-header-banner`, an
    anchor whose `href` is `tel:` immediately followed by the vendor's stored `contactPhone` with
    spaces removed, and renders no such anchor when `contactPhone` is `null`.

R6. That anchor's class list contains neither `hidden` nor any `md:` or `lg:` visibility variant, so
    it renders at every viewport width.

R7. That anchor carries an `aria-label` starting with the word `Call`, so its accessible name says
    what the digits are for rather than reading them out unlabelled.

R8. `grep -n "01908" components/layout/Header.tsx` returns no match — the number renders from
    `contactPhone`, never from a literal.

## Department carousel (items 11a, 11b)

R9. In a test using fake timers: after a `mouseEnter` on the carousel region, a click on the
    pause/resume control, and a second click on it, advancing timers by `ROTATE_MS` moves
    `aria-current="true"` to a different one of the `Show <department>` dot controls — an explicit
    resume overrides a hover that is still in effect.

R10. In a test using fake timers: after a `mouseEnter` on the carousel region with **no** click on
     the pause/resume control, advancing timers by twice `ROTATE_MS` leaves `aria-current="true"` on
     the same dot control — hover still pauses for a shopper who never touches the control.

R11. `components/layout/DepartmentHero.tsx` still sets its initial paused state from
     `prefers-reduced-motion` before any explicit-choice rule is applied, and the pause control still
     has the accessible name `Pause department rotation` when rotation is running.

R12. `ROTATE_MS` in `components/layout/DepartmentHero.tsx` is `4000`.

## Shop your list (items 18, 19, 20)

R13. The `textarea` in `components/cart/ShopYourList.tsx` carries a placeholder colour utility that
     is not `placeholder:text-primary-muted`, and `git diff --name-only origin/staging...HEAD` does
     not list `design-system/tokens/tokens.css`.

R14. In the static markup of `components/cart/ShopYourList.tsx`, the quantities hint text appears
     before the `textarea` element.

R15. The first `option` of the ambiguous-line `select` in `components/cart/ListReview.tsx` has
     `value=""` and label text containing both a word directing a choice (`choose` or `select`,
     either case) and the word `skip`.

## Rewards earning copy (items 12a, 12b)

R16. `RewardsData` in `components/rewards/RewardsPanel.tsx` declares a required numeric
     `maxMultiplier` field, and `components/rewards/RewardsPanel.tsx` passes it to
     `WaysToEarnAccordion`.

R17. `lib/rewards-service.ts` returns `maxMultiplier` computed from the vendor's loyalty tiers in its
     signed-in branch and `1` in its signed-out branch, and the number of database reads that
     function performs in each branch is unchanged by this slice.

R18. `components/rewards/WaysToEarnAccordion.tsx` renders `point` when `pointsPerPoundEarned` is `1`
     and `points` when it is greater than `1`.

## Referral copy (item 13)

R19. `components/rewards/ReferralCard.tsx` renders the referral offer sentence stating the minimum
     order value derived from `MIN_REFERRAL_ORDER_PENCE` through `formatPrice`, not as a literal
     string.

R20. That sentence does not claim the discount is restricted to a chronologically first order; it
     describes the restriction the code enforces, which is one use per customer
     (`maxPerCustomer: 1`) above the minimum in R19.

## Available rewards (item 15)

R21. `grep -nE "\b(500|1000)\b" components/rewards/AvailableRewardsSection.tsx` returns no match —
     every threshold is derived from `minRedeemPoints`.

R22. `components/rewards/AvailableRewardsSection.tsx` renders one card per threshold at `1x`, `2x`
     and `5x` `minRedeemPoints`, each labelled with its own points figure and its cash value computed
     through `pencePerPointRedeemed`.

R23. `components/rewards/AvailableRewardsSection.tsx` renders nothing at all when `minRedeemPoints`
     is `0`, and its copy contains the word `voucher` nowhere.

## Cross-vendor and gates

R24. With `npm run preview` running, the storefront home of a **second** vendor whose branding
     differs (SriMart) renders its own logo in the header brand box and either its own
     `contactPhone` or no phone anchor at all, with no Aheed value, locality or colour on the page.

R25. `CHANGELOG.md` is updated on this branch (Gate 4).

R26. `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` all exit 0
     after this slice.
