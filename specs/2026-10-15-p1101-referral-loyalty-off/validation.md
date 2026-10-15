# A loyalty-off vendor stops running a referral scheme (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid
> testing the same behaviour multiple times at different levels unless doing so provides additional
> confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

The logic for each of the three gates is unit-tested where it lives: the service, the repository,
and the pure payout function. The real system is exercised twice. R5 counts real rows created by
real signed-in renders. R15 measures real computed colours in a browser. The rest is a code read.
DB-touching checks use `npm run preview`, never `npm run dev` (CLAUDE.md, Database).

**Two vendors matter here, and they differ on purpose.** SriMart (`srimart.localhost:8787`, port
included, `docs/developer-portal/local-dev-playbook.md`) has loyalty **off** on the dev database.
Aheed (`localhost:8787`) has it **on**. Measured at Spec on 2026-10-15: SriMart had 0 referral
codes, Aheed had 2. Before R5, confirm SriMart is still loyalty-off. If it isn't, R5 is **BLOCKED**,
not passed.

**SriMart cookies.** A `curl` cookie jar silently drops `Secure` cookies for the multi-label
`srimart.localhost:8787` host (local-dev playbook). Copy the session value out of the sign-in
response's `Set-Cookie` header and send it back on each request as `-H "Cookie: ..."`.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/rewards-service.test.ts` passes. Read the test: with mocked config `loyaltyEnabled: false` and a `userId`, it asserts `balance`, `tiers`, `windowSpend` and `getReferralStats` mocks were each called 0 times. |
| R2  | Unit | Same file: the loyalty-off signed-in case asserts every field R2 lists, by value. |
| R3  | Unit | Same file: the loyalty-on signed-in case asserts `getReferralStats` was called once with the `userId`, and that the returned `referralCode` equals the mock's. |
| R4  | Unit | Same file: a `null` `userId` case runs for **both** `loyaltyEnabled` values, asserting `authenticated: false` and `getReferralStats` not called. |
| R5  | E2E | `npm run preview`. (1) A read-only `npx tsx` script against `.dev.vars`' `DATABASE_URL` confirms SriMart `loyaltyEnabled = false`, then records the `DiscountCode` count with `vendorId` SriMart and `referrerUserId` = `demo-customer@example.com`'s id, which must be 0. (2) Sign in on `-H "Host: srimart.localhost:8787"` through `POST /api/auth/sign-in/email`. Use the account password from the operator, never committed. If sign-in fails on credentials, R5 is BLOCKED. (3) `GET /`, `/search?q=a` and `/cart` with that session, each returning 200. (4) Recount: still **0**. (5) Repeat 2–4 on `-H "Host: localhost:8787"`. The Aheed count for that user is **1** afterwards, never 2. Record every count. |
| R6  | Unit | `grep -n 'REFERRALS_UNAVAILABLE' lib/discounts.ts` shows it in `CodeRefusalReason` and in `refusalMessage`, returning the exact R6 string. `npm run typecheck` exits 0, which proves the switch is still exhaustive. |
| R7  | Unit | `npx vitest run tests/discounts-preview.test.ts` passes. Read it for: (a) a referral code on a loyalty-off vendor giving `REFERRALS_UNAVAILABLE`; (b) the same code with the claimant **as** its owner giving `REFERRALS_UNAVAILABLE`, not `OWN_REFERRAL_CODE`. |
| R8  | Unit | A test asserts `claimCode` in R7's case returns `REFERRALS_UNAVAILABLE`, with the `discountCode.updateMany` mock called 0 times. |
| R9  | Unit | `tests/discounts-preview.test.ts` has: a referral code with loyalty on giving `ok: true`; a staff code giving `ok: true` with loyalty off and with loyalty on; and a staff-code case asserting `vendorConfig.findUnique` was not called. |
| R10 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes. `git diff origin/staging -- lib/repositories/discounts.ts` shows `getLoyaltyConfig(db, vendorId)`, or the `tx` / `vendorId` it was given, and no change to the `previewCode` or `claimCode` signature lines. |
| R11 | Code read | `grep -n 'recordCallerUnknownCode' features/checkout/place-order.ts lib/checkout-preview-service.ts`. Each call is guarded by `reason === "UNKNOWN"`. |
| R12 | Unit | `npx vitest run tests/referrals.test.ts` passes. Read it: a `loyaltyEnabled: false` case returns `null` for a valid non-self referrer, and the pre-existing cases pass `true`. In `lib/referrals.ts` the parameter is `loyaltyEnabled: boolean`, with no `?` and no `=`. |
| R13 | Code read | `grep -rn 'referralBonusRecipient(' lib features app --include=*.ts --include=*.tsx` (scoped to source, not the repo root, which would match generated KMS copies) shows exactly two lines: the definition in `lib/referrals.ts`, and the `confirmPayment` call in `lib/repositories/orders.ts` passing `loyaltyConfig.loyaltyEnabled`. |
| R14 | Unit | `npx vitest run tests/rewards-components.test.tsx` passes. Read it for both a light and a dark signed-out render asserting the R14 classes. |
| R15 | Accessibility | `npm run preview`. Open `http://localhost:8787/` signed out in a real browser and open the Rewards panel. Read `getComputedStyle` `color` from the sign-in sentence and `background-color` from its box, and compute the WCAG contrast ratio from the rgb values. If the box is translucent, composite it over the card's computed white before computing. The result is ≥ 4.5. Record both rgb values and the ratio. |
| R16 | Code read | `grep -n -i 'voucher' 'app/(storefront)/account/loyalty/page.tsx'` returns either nothing or only lines inside comments, and the intro `<p>` text is exactly the R16 sentence. |
| R17 | Code read | Read the helper paragraph under the toggle in `components/staff/LoyaltyConfigForm.tsx`. It states all three facts and names no vendor. |
| R18 | Code read | Read the Loyalty section of `docs/store-admin-guide/admin-tabs-guide.md` for the three facts. `git diff origin/staging -- docs/store-admin-guide/admin-tabs-guide.md` shows the `version` and `updated` front-matter bumped. |
| R19 | Code read | `git diff origin/staging --stat -- prisma/` prints nothing. |
| R20 | Code read | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1101` and `#1034`. |
| R21 | Regression | Read CI on the PR (ground truth): `quality / quality` and `quality / kms` green. Locally: `npm run lint`, `npm run typecheck` and `npm run format:check` exit 0. Run `npx vitest run` **alone**, never beside a build, and read its summary line. `npm run build` exits 0. `npm run kms:validate` exits 0. `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` exits 0, reading the real exit status rather than a piped `tail`. |
