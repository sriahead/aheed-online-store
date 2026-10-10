# Public docs boundary and loyalty-gated Rewards launcher (build notes)

Branch `feature/p1022-1023-public-docs-rewards-gate`, cut from the docs-carry branch
`docs/1016-1017-document-carry` (itself one commit ahead of `origin/staging` at `162b38e`), so it
also carries two Document-stage commits for PR #1032/#1033 (`1ebf42d`, `5f88678` — handoff and
roadmap only). Spec `a51c40a`, build `610747a`. Both issues moved to `In Progress` on Project #2.

## What changed and why

- **`lib/public-docs.ts` (new).** `getPublicShopperGuide(articles = DOC_ARTICLES)` loops the array
  and returns the entry whose `id` is `SHOPPER_GUIDE_ID` (`docs/shopper-help/shopping-guide.md`)
  only if its `visibility` is `"public"`; otherwise, or if the id is absent, `null`. It stops at
  the first id match, so a duplicate id later in the list can never be reached (ids are unique by
  construction in `kms:build-index`). Exports a narrow `PublicDocArticle` type
  (`id`/`title`/`visibility`/`content`) so callers stop using `any`.
- **`app/(storefront)/help/page.tsx`.** The `DOC_ARTICLES` import, the audience/visibility filter
  and its long history comment are replaced by `const shopperGuide = getPublicShopperGuide()` and a
  short comment pointing at the helper and the guard. The section renders under
  `{shopperGuide && (...)}`, so heading and content both disappear on `null`. Heading text
  unchanged.
- **`components/layout/StorefrontChrome.tsx`.** `RewardsLauncher` is wrapped in
  `{initialRewardsData.loyaltyEnabled && (...)}` with a JSX comment giving the reason and the
  accepted `?ref=` consequence. `getRewardsDataForUser` returns `loyaltyEnabled` from the vendor's
  `LoyaltyConfig` on both its signed-out and signed-in branches, so no new read was added.
- **Tests (all new except one):**
  - `tests/public-docs.test.ts` — R3's four cases (real corpus; internal shopper article sorted
    first; guide marked internal; guide absent while another public shopper article exists). The
    real-corpus case has a 60s timeout because the generated module is large to import cold.
  - `tests/public-docs-boundary.test.ts` — R6/R7. A recursive walk of the four roots, a
    TypeScript-AST visitor over `ImportDeclaration`, `ExportDeclaration`, and `CallExpression`
    whose callee is the `import` keyword or the identifier `require`. Specifier match strips one
    extension, then requires equality with or a `/`-prefixed suffix of `staff/runbook/docs` (so
    `docs-helper` does not match). Exempts paths starting `app/(admin)/` and exactly
    `lib/public-docs.ts`. Extra assertions beyond R7: a type-only import is flagged, `require` is
    flagged, a suffix-sharing module is not, the walk finds more than 100 files, and the helper
    itself does import the module (so the exemption is never dead weight).
  - `tests/storefront-chrome-rewards-gate.test.tsx` — R10. Renders the real async
    `StorefrontChrome` (awaited, then passed to `render`) with `next/headers`, `@/lib/auth`,
    `@/lib/rewards-service`, `@/lib/vendor-theme` mocked and the four untouched siblings (`Header`,
    `FloatingContact`, `CookieBanner`, `QuickViewDrawer`) mocked to `null`; the real
    `RewardsLauncher`, `QuickViewProvider` and `CartFeedbackProvider` render.
  - `tests/help-vendor-facts.test.tsx` — one new `describe` for R5, using the file's existing
    `renderHelp()` and mocks; it renders the real generated corpus through the real helper.
- **`docs/developer-portal/app-conventions.md` 1.7.0 → 1.8.0** — the existing `#1022` bullet gains
  the helper-is-the-only-route rule and names the guard test (R13).
- **`plan.md`** — the "Accepted consequence" paragraph is corrected in place with a dated
  blockquote (see Deviations).

Measured during Build (not a substitute for Validate):

- Slice test files run alone: 5 files, 38 tests, all pass (includes `tests/rewards-components.test.tsx`, unchanged).
- R8 negative proof: prepending an `@/app/(admin)/staff/runbook/docs` import to
  `app/(storefront)/cart/page.tsx` made the boundary test fail naming that file; reverted with
  `git checkout`, tree clean.
- `npm run lint`, `typecheck`, `format:check` exit 0. Full `npx vitest run` was **not** run at
  Build.
- Under `npm run preview` (signed out, `http://127.0.0.1:8787`): Aheed (`Host: localhost:8787`)
  `/` and `/help` 200 with the launcher label present (1 each); SriMart
  (`Host: srimart.localhost:8787`) `/` and `/help` 200 with it absent (0). Both `/help` pages
  contain `Guest Checkout` (2 matches) and zero `PENDING_PAYMENT`/`Known Trap`. SriMart's render
  was confirmed to be SriMart (`SriMart` present, `Aheed Food Centre` absent). The preview's
  node/workerd chain was killed afterwards.

## Decisions taken during the build

- **The helper takes `readonly unknown[]` and narrows internally**, rather than typing the
  parameter as the generated `any[]`. The crafted test arrays then need no casts, and nothing
  outside the helper sees `any`.
- **The boundary test flags type-only imports too.** R6 says static `import` "including
  `import type`" is covered; type imports were kept in deliberately, since a type import of the
  corpus is still someone building against it outside the helper.
- **`SHOPPER_GUIDE_ID` is exported** so the unit test builds its crafted guide from the same
  constant. It is a platform document path, not vendor copy.
- **The chrome test mocks four unrelated chrome children to `null`** rather than rendering them,
  to keep it independent of their own data dependencies (cart, quick-view fetches, consent). Each
  has its own tests; R9 says nothing else in the chrome changes, and validation checks that by diff.
- **Two follow-ups filed now** (step 4), both `Backlog`/`P10` on Project #2: `#1034` (below) and
  `#1035` (the `shopper` audience tag on two internal articles — `plan.md` excluded it; filed so it
  does not vanish when `#1022` closes). The `aheed_referral_code` cookie name is noted inside
  `#1034` rather than filed separately — it is cosmetic.

## Deviations from the spec

- **`plan.md`'s "Accepted consequence" premise was wrong and is corrected in-branch.** It said a
  referral code is only ever *created* from `/account/loyalty` or the Rewards panel. In fact
  `StorefrontChrome` → `getRewardsDataForUser` → `getReferralStats` → `getOrCreateReferralCode`
  runs for **every signed-in shopper on every storefront render**, loyalty on or off
  (`lib/rewards-service.ts`, the `Promise.all` after the `!userId` early return). The owner-accepted
  consequence is unchanged — after this slice nothing on a loyalty-off vendor *shows* a code, so no
  vendor-shared link exists to capture — but the reasoning has been reworded to "shows", with a
  dated blockquote recording the correction. **No requirement changed.** Fixing the unconditional
  creation would touch `lib/rewards-service.ts` and `/api/rewards`, outside R9's "no other change";
  filed as `#1034` instead.

## Known-shaky areas

- **R11/R12's SriMart result depends on the dev database still having SriMart at
  `loyaltyEnabled: false`.** It did at Build (the launcher was absent and the page was confirmed to
  be SriMart's). If someone flipped it, the SriMart half reads as a failure that is really data —
  check `LoyaltyConfig` first, as `validation.md` says.
- **Only signed-out renders were proved live.** The gate reads the vendor flag, which both branches
  of `getRewardsDataForUser` return, so a signed-in shopper should behave the same; that was not
  driven live. A signed-in SriMart shopper also still triggers `#1034`'s referral-code creation,
  which this slice does not change.
- **The boundary test's root list is fixed** (`app`, `components`, `lib`, `features`). A new
  top-level source directory imported by storefront code would be outside it. Today nothing else
  under the repo root is part of the Next app's storefront import graph except those four (and
  `scripts/`/`kms/`, which are not rendered).
- **`tests/public-docs.test.ts`'s real-corpus case and `tests/help-vendor-facts.test.tsx` both
  import the large generated module.** Under a loaded full-suite run they are the files most likely
  to hit the documented forks-pool timeout trap; rerun them alone before calling a timeout a
  failure.
- **The `/help` comment block that used to explain the `#1022` defect in detail was shortened.**
  The history now lives in the helper's docstring, `#1022` and `app-conventions.md`; the page
  comment just points there.
