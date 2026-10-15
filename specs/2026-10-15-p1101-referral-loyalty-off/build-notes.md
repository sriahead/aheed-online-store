# A loyalty-off vendor stops running a referral scheme (build notes)

Written at the end of Build, before the pre-validation Clear. Commits on
`feature/p1101-referral-loyalty-off` (branched from `origin/staging` at `244b261`):

- `e72a94f`: the spec
- `e080708`: the KMS index for the plan
- `335b1d0`: the implementation and tests
- `e24bf6c`: the KMS index for the admin-guide edit
- the build-notes commit, which adds this file, `CHANGELOG.md` and the triage-doc update

## What changed and why

- **Creation, `lib/rewards-service.ts`.** The signed-out early return now also fires when
  `!config.loyaltyEnabled`. The condition is `!userId || !config.loyaltyEnabled`, and
  `authenticated` became `userId !== null`. So a loyalty-off vendor returns the same shape as a
  signed-out visitor, still marked authenticated, before the `Promise.all` that reads balance, tiers
  and spend and calls `getReferralStats` (which creates a code). There is one edit for both callers
  (`StorefrontChrome`, `/api/rewards`). `getReferralStats` itself is unchanged; its other caller,
  `/account/loyalty`, already 404s when loyalty is off.
- **Redemption, `lib/repositories/discounts.ts` `previewCode`.** Directly after the `UNKNOWN` return
  there is now
  `if (row.referrerUserId && !(await getLoyaltyConfig(db, vendorId)).loyaltyEnabled) return
  REFERRALS_UNAVAILABLE`. It sits before the `#972` `OWN_REFERRAL_CODE` check, so it outranks it.
  `claimCode` gets it through its existing delegation to `previewCode`, so it returns before any
  `updateMany`. `getLoyaltyConfig` is imported from `lib/repositories/loyalty.ts`; there is no
  import cycle, since `loyalty.ts` does not import `discounts.ts`. The `&&` short-circuit means a
  staff code never reads the config.
- **`lib/discounts.ts`.** Adds `REFERRALS_UNAVAILABLE` to `CodeRefusalReason`, with a doc comment.
  The `refusalMessage` case returns `Referral codes can't be used at this store right now.`, and
  `typecheck` proves the switch is still exhaustive.
- **Payout.** `lib/referrals.ts` `referralBonusRecipient` gains a required third parameter
  `loyaltyEnabled: boolean`, checked first. Its one call, in `confirmPayment`
  (`lib/repositories/orders.ts`, around line 1794), passes `loyaltyConfig.loyaltyEnabled`, the same
  value the earn path a few lines above already reads.
- **`components/rewards/ReferralCard.tsx`, signed-out branch.** Light uses
  `bg-surface-muted` + `text-primary`; dark keeps `bg-black/20` + `text-stone-300`. Both are chosen
  through the file's existing `isDark` flag.
- **Copy.**
  - `app/(storefront)/account/loyalty/page.tsx`: the intro now reads "…, spend them at checkout,
    and refer friends.", and the JSX comment "Available Rewards Vouchers" became "Available Rewards".
    The file no longer contains "voucher".
  - `components/staff/LoyaltyConfigForm.tsx`: the toggle's helper text adds referrals.
  - `docs/store-admin-guide/admin-tabs-guide.md` 2.14.0: the Loyalty section's "What you can do"
    now names the on/off switch, which exists (the `loyaltyEnabled` checkbox in
    `LoyaltyConfigForm.tsx`) but the guide never mentioned. "Common mistakes and limitations" leads
    with the referral fact.
- **Tests.**
  - `tests/rewards-service.test.ts` (new) covers R1–R4.
  - `tests/discounts-preview.test.ts` covers R7–R9 in a new `describe`. `readOnlyDb`/`claimingDb`
    gained a `vendorConfig.findUnique` mock with a `loyaltyEnabled` parameter defaulting to `true`.
  - `tests/referrals.test.ts` covers R12; the existing cases now pass `true`.
  - `tests/rewards-components.test.tsx` covers R14, both variants.

## Decisions taken during the build

- **The `readOnlyDb` mock defaults `loyaltyEnabled` to `true`.** Every test written before `#1101`
  that uses a referral code (the `#972` block, `ref-userabc1` with an owner) assumed a scheme that
  runs. With no `vendorConfig` on the mock they would have thrown inside `getLoyaltyConfig`. A
  default of `true` keeps them testing what they were written to test. I rejected the alternative of
  making each old test pass a flag: it touches nine tests for no added coverage.
- **The `vendorConfig.findUnique` mock is a `vi.fn`** so that R9's "staff code reads no config" can
  be asserted as `not.toHaveBeenCalled()`, not inferred.
- **No closing keyword in any commit message.** `#1101` and `#1034` close through the PR body
  only. That's the `#1022` lesson: GitHub reads every commit message on the default branch.
- **Mutation-checked, not only green.**
  - With `lib/rewards-service.ts` reverted to `HEAD`, R1 and R2 fail.
  - With the `previewCode` gate replaced by `if (false)`, the two R7 tests and the R8 test fail.
  - The original code was restored both times. The `git diff --numstat` afterwards showed only the
    intended lines.

## Deviations from the spec

None.

## Known-shaky areas

- **Nothing here is proven live yet.** R5 (real rows from real signed-in renders) and R15 (real
  computed contrast) are left to Validate on purpose. Everything else is unit-tested or a code read.
- **R5's sign-in.** It needs the `demo-customer@example.com` password, which isn't committed and
  has been wrong locally before (`docs/developer-portal/env-setup.md` 1.17.0). The SriMart host is
  multi-label, so read the cookie from `Set-Cookie` and don't use a jar (local-dev playbook).
  At Spec, SriMart had 0 referral codes on dev, `loyaltyEnabled = false`, and `demo-customer` exists.
  The dev DB also holds several hundred leftover fixture vendors (`#797`), so filter by slug.
- **R15 is measurable only on Aheed.** SriMart has loyalty off, renders no launcher, and so never
  shows the box. The second-vendor guarantee is `brandStyle()`'s clamp of `--color-primary` against
  cream (`lib/vendor-theme.ts`); see `plan.md`.
- **The full `npx vitest run` failed once, run alone:** 1 of 3234, in
  `tests/add-to-cart-feedback.test.tsx`, "a rejected call is caught … button enabled". That is the
  known flake `#983`. The file passed 3 of 3 times on its own, and this slice doesn't touch it. If it
  recurs in CI, `gh run rerun --failed` is the documented response. Everything else was green: 251
  files and 3233 tests, `typecheck`, `lint`, `format:check`, `build`, `kms:validate`,
  `kms:check-generated`, `kms:assemble:internal`, and the `kms/site-internal` Next build.
- **The checkout pre-fill path is unit-proven only.** On a loyalty-off vendor, a referral cookie now
  shows the new refusal message. It is reached only through `previewCode`, and nothing writes that
  cookie on a loyalty-off vendor (`RewardsLauncher` isn't rendered there), so it wasn't driven live.
- **Deferred and filed:**
  - `#1102`: counting and possibly cleaning up existing loyalty-off referral codes in production
    (owner).
  - `#1103`: per-vendor referral amounts (triage 12.1).
  - Item 16 still needs the owner to confirm they were signed out; that's in `#1101`'s body.
