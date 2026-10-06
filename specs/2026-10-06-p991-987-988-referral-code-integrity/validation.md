# #991, #987, #988 — Referral and discount-code integrity (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice touches payments-adjacent money paths (a discount and referral points) and a security
control, so it carries integration checks against a real database and two runtime checks through
the Worker, not just unit tests.

1. **Unit:** code generation and retry rules, the throttle boundary, the own-code and points-credit
   decisions, and both enforcement points' branching. All mocked, under vitest.
2. **Integration:** the verify script runs against the real dev database. It covers the backfill,
   concurrent creation on both adapters, erasure, redemption, and the throttle.
3. **System:** under `npm run preview`, the loyalty page creates exactly one row, and the Apply
   control trips the throttle in a real browser.
4. **Security:** the throttle and its fail-open behaviour (R19–R25). No raw IP is stored (R19).

## Before you start

- Read `plan.md`, then `build-notes.md`, in the spec folder.
- **DB-touching checks need `npm run preview`, never `npm run dev`.** `next dev` cannot load the WASM
  engine.
- **Run `npx vitest run` on its own,** never beside or straight after a build.
- The verify script reads `DATABASE_URL` from `.env`. Before running it, check that `.env`'s
  database is the **dev** project, not staging or production: compare it against
  `secrets/staging.vars` and `secrets/production.vars`, and confirm it matches neither.
- Signing in under preview: use a Node `fetch()` (or the browser's page JavaScript) against
  `/api/auth/sign-in/email` on `http://localhost:8787`, as `docs/developer-portal/local-dev-playbook.md`
  describes. Use a dev demo shopper account.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Measurement  | Open `build-notes.md`. It has a staging line and a production line, each with: the `REF-` row count; the count whose description names an existing user; the command used; the date. Both were measured before the migration reached that environment. Any environment not measured has a stated reason. A blank field fails. |
| R2  | Schema       | Read `prisma/schema.prisma`. In `model DiscountCode`, confirm `referrerUserId String?`, its relation with `onDelete: SetNull`, and `@@unique([vendorId, referrerUserId])`. Confirm `User` has the back-relation. Confirm `model DiscountCodeAttempt` has exactly `id`, `vendorId` (with relation), `ipHash`, `createdAt` and `@@index([vendorId, ipHash, createdAt])`. Then run `npx prisma validate`, which must exit 0. |
| R3  | Migration    | `ls prisma/migrations \| grep _p987_988_referral_owner_code_throttle` must show exactly one directory. In its `migration.sql`, confirm the column, the FK with `ON DELETE SET NULL`, the unique index on `("vendorId", "referrerUserId")`, and the `DiscountCodeAttempt` table, index and FK. `grep -nE "DROP (INDEX\|TABLE\|COLUMN)" <that file>` must print nothing. |
| R4  | Integration  | `npx tsx scripts/verify-referral-code-integrity.ts backfill` exits 0 and prints a PASS line for each of cases (a), (b) and (c). Read the script to confirm two things: it executes the statements read from the migration file, not a copy of them; and it rolls back. |
| R5  | Integration  | `npx prisma migrate status` prints that the database schema is up to date. |
| R6  | Unit         | `npx vitest run tests/referral-codes.test.ts` passes. It has a case where an existing owner row is returned and `create` is not called. |
| R7  | Unit         | Same file. It has a case asserting every field of the `create` payload listed in R7, and asserting the returned code matches `^REF-[A-HJ-NP-Z2-9]{8}$`. Read `lib/repositories/referral-codes.ts` to confirm the characters come from `crypto.getRandomValues`. |
| R8  | Unit         | Same file. It has each case R8 lists: owner-found-on-re-read for `P2002` and for `23505`; collision-then-success; 5 collisions then a throw (the `create` mock called exactly 5 times); a non-unique error rethrown after exactly one `create` call. Read the source to confirm it calls `isUniqueViolation`. |
| R9  | Integration  | `npx tsx scripts/verify-referral-code-integrity.ts concurrent` exits 0. It prints a PASS for the HTTP-adapter run and one for the WebSocket-adapter run, each stating one row and the same code from both calls. |
| R9a | Integration  | `npx tsx scripts/verify-referral-code-integrity.ts erasure` exits 0 and prints a PASS stating the code row remains, with a null owner and an unchanged code. |
| R10 | Unit         | A vitest test of `getReferralStats` with `getOrCreateReferralCode` mocked to throw asserts two things: the result has `referralCode: ""` and `completedCount: 0`; and `console.error` was called with a first argument starting `Referrals:`. |
| R11 | Static       | `grep -rn "ensureReferralDiscountCode" lib app components features` prints nothing. `grep -nF ".catch(() => {})" "app/(storefront)/account/loyalty/page.tsx" lib/rewards-service.ts` prints nothing. |
| R12 | Static       | Run `grep -rnE "\b(generateReferralCode\|extractReferrerUserId\|isUsersOwnReferralCode)\(" lib app components features tests`. It must print nothing. |
| R13 | Unit         | `npx vitest run tests/discounts-preview.test.ts` passes. It contains both R13 cases: a description-only row not refused, and an FK-owned row refused. |
| R14 | Unit         | A vitest test (name the file in `build-notes.md`) covers all three owner cases with the call counts R14 states. If it targets a helper, read `confirmPayment` to confirm the helper is what decides the `awardReferralBonusPoints` call. |
| R15 | System       | Under `npm run preview`: (1) on the dev DB, delete the demo shopper's referral row if one exists, and record the shopper's user id. (2) Sign in as that shopper and `GET /account/loyalty`. (3) Query `DiscountCode` where `referrerUserId` is that id: exactly one row, and the page HTML contains its `code`. (4) `GET /account/loyalty` again, and then `GET /`. Re-query: still exactly one row, with the same code. |
| R16 | Integration  | `npx tsx scripts/verify-referral-code-integrity.ts redeem` exits 0. It prints a PASS stating that a second fixture shopper's preview returned `ok: true` with `discountPence` equal to `REFERRAL_DISCOUNT_PENCE`. |
| R17 | Static + Unit | Read the loyalty page and `getRewardsDataForUser`: each passes `referralUrl: ""` when the code is empty. A vitest test of `getRewardsDataForUser` with an empty code asserts `referralUrl === ""`. |
| R18 | Unit         | `npx vitest run tests/rewards-components.test.tsx` passes. It contains a case with `authenticated` true and an empty `referralCode` that asserts: the unavailable sentence is present; no element is named `Share referral link`; there are no share links. |
| R19 | Unit + Integration | `npx vitest run tests/discount-code-throttle.test.ts` passes, covering 9 rows (not throttled), 10 rows (throttled), the hash and the sweep. Then `npx tsx scripts/verify-referral-code-integrity.ts throttle` exits 0, with PASS lines for: same vendor and IP throttled; second vendor not throttled; other IP not throttled. |
| R20 | Unit         | A vitest test asserts that `refusalMessage("TOO_MANY_ATTEMPTS")` equals the throttle message exactly. `npm run typecheck` exits 0, which proves the `switch` is still exhaustive. |
| R21 | Unit         | A vitest test of `previewCheckoutCode` covers four cases: throttled (preview not called, throttle message returned); UNKNOWN (record called once); another refusal (record not called); success (record not called). |
| R22 | Static       | Read `CheckoutError` and confirm its optional `reason`. `grep -n 'new CheckoutError("DISCOUNT_CODE"' lib/repositories/orders.ts` must show both sites, and each passes a reason. |
| R23 | Unit         | A vitest test of `placeOrderAction` covers four cases: throttled with a code (`placeOrder` not called, throttle message returned); `CheckoutError` with reason UNKNOWN (record called once); another `CheckoutError` (record not called); blank code (throttle not consulted). |
| R24 | Unit         | Vitest tests make the throttle functions throw. In both `previewCheckoutCode` and `placeOrderAction`, they assert two things: `console.error` was called with a message starting `Discount throttle:`; and the preview or order placement still ran. |
| R25 | System       | Under `npm run preview`, use a browser with a non-empty cart at `/checkout`, signed in or as a guest. Note the time, then Apply 10 distinct made-up codes. Each shows "That discount code isn't recognised.". Apply a valid active dev code: the throttle message shows. Wait until 60 seconds have passed since the first attempt, then Apply the same valid code: it applies, and the total includes it. |
| R26 | Docs         | Read `specs/architecture.md`: one bullet or paragraph names `DiscountCode.referrerUserId` as the referral owner and states the per-vendor, hashed-IP throttle on unknown codes. Read `docs/shopper-help/shopping-guide.md`'s Discounts line, which mentions waiting a minute after several unrecognised codes. `git diff origin/staging -- <file>` shows `version` and `updated` bumped in both files. |
| R27 | Docs build   | `npm run kms:validate` exits 0. `npm run kms:build-index && npm run kms:check-generated` exits 0. `npm run kms:assemble:internal`, then `cd kms/site-internal && npx next build --webpack`, exits 0. Read the real exit status, not a piped one. |
| R28 | Gate 4       | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#991`, `#987` and `#988`. |
| R29 | Gate 3       | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build` each exit 0. Then run `npx vitest run` alone: it exits 0, its summary line shows no failed files, and every test file in the repo is listed as run. CI's `quality` job is green on the PR. |
