# #991, #987, #988 — Referral and discount-code integrity (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

Branch `feature/991-987-988-referral-code-integrity`, cut from `origin/staging` at `dd6505b`.

- Spec commit: `ab1f96a`.
- Implementation commit: `751e577`.
- This file, the CHANGELOG and the handoff are in the commit after that.

Nothing has been pushed, and no PR is open yet.

## R1 measurement (recorded before the migration reached any shared environment)

| Environment | DB host (pooled) | `REF-` rows | …whose description names an existing user | Measured by |
|---|---|---|---|---|
| staging | `ep-empty-scene-zafjzeye-pooler` | 0 | 0 | assistant, 2026-10-06 |
| production | `ep-young-glitter-zadlkttm-pooler` | 0 | 0 | owner-run, 2026-10-06 (auto mode blocks production access) |
| dev | `ep-dry-morning-zab7dx08-pooler` | 0 | 0 | assistant, 2026-10-06, before applying the migration |

The command is read-only and is the verify script's `count` mode:
`npx tsx scripts/verify-referral-code-integrity.ts count --env-file secrets/<env>.vars`. For dev,
the same command runs without `--env-file`, so it reads `.env`.

**What it means.** No shared environment holds a single referral row, even though staging's demo
shoppers have opened `/account/loyalty`. So `#991` was **not** a preview-only artefact: the
fire-and-forget create has never left a row on a deployed Worker. Every code shown on staging or
production so far was unredeemable. The backfill is therefore a no-op on both, and no shared link
can break.

It is still unknown **which** of `#991`'s two candidate causes was responsible: the dropped
un-awaited promise, or an error swallowed by the `catch {}`. This slice removes both paths, so that
no longer matters for the fix. R15 proves the new path under the Worker.

## What changed and why

- **Schema and migration** (`prisma/schema.prisma`,
  `prisma/migrations/20261006120000_p987_988_referral_owner_code_throttle/`):
  - `DiscountCode.referrerUserId`, a nullable foreign key to `User` through the named relation
    `ReferralCodeOwner`, with `onDelete: SetNull` and `@@unique([vendorId, referrerUserId])`.
  - `User.referralCodes` and `Vendor.codeAttempts` back-relations.
  - The `DiscountCodeAttempt` model.
  - The backfill sits between `-- BACKFILL BEGIN` and `-- BACKFILL END` marker comments. The
    verify script's `backfill` mode extracts and executes exactly that block, so R4 tests the file
    itself rather than a copy.
- **`lib/referrals.ts`.**
  - Removed: `generateReferralCode`, `extractReferrerUserId`, `isUsersOwnReferralCode` and the
    `REF_NOCAPED` fallback.
  - Added `generateRandomReferralCode`, using `crypto.getRandomValues` with an injectable byte
    source for tests. The alphabet has 32 characters, `A–Z` and `2–9` without `0`, `1`, `O` and
    `I`, so `byte & 31` has no modulo bias.
  - Added `referralBonusRecipient(referrerUserId, orderUserId)`, the pure decision behind
    `confirmPayment`'s bonus.
- **`lib/repositories/referral-codes.ts` (new).** `getOrCreateReferralCode` reads by owner and
  creates when there is no row. On a unique violation (via `isUniqueViolation`) it re-reads by
  owner: if a row is found it returns it (a concurrent create won), otherwise it retries with a
  fresh code, at most 5 creates in total. `countReferralRedemptions` replaces the old `_count`
  read. Both take `prisma`, `vendorId` and `userId` explicitly, which satisfies the
  repository-purity tests.
- **`lib/referrals-service.ts`.**
  - `getReferralStats` awaits get-or-create and the redemption count in parallel.
  - On any error it logs `Referrals: …` and returns `referralCode: ""`, `completedCount: 0`.
  - `ensureReferralDiscountCode` is deleted.
- **Callers.** `app/(storefront)/account/loyalty/page.tsx` and `lib/rewards-service.ts` lost their
  `.catch(() => {})` calls. Both now pass `referralUrl: ""` when the code is empty.
- **`components/rewards/ReferralCard.tsx`.** When `authenticated` is true and `referralCode` is
  empty, the card renders the unavailable sentence. It hides the link box, the copy button, the
  three share links and the header `navigator.share` button.
- **`lib/repositories/discounts.ts`.** `previewCode` selects `referrerUserId` instead of
  `description`. The own-code check is now `isSelfReferral(row.referrerUserId, input.userId)`, with
  no `REF-` shape check.
- **`lib/repositories/orders.ts`.**
  - `confirmPayment` selects `code.referrerUserId` and awards the bonus to
    `referralBonusRecipient(...)`.
  - `CheckoutError` gained an optional `reason?: CodeRefusalReason`, set at both `DISCOUNT_CODE`
    throws.
- **`lib/discounts.ts`.** Added the `TOO_MANY_ATTEMPTS` reason, with the message "Too many code
  attempts. Please try again in a minute."
- **`lib/repositories/discount-code-throttle.ts` (new).** Exports `hashIp`,
  `isDiscountCodeCheckThrottled` (count ≥ 10 in the last 60 s) and `recordUnknownDiscountCode`
  (create, plus a 1% one-hour sweep). It mirrors `order-lookup-rate-limit.ts`.
- **`lib/discount-code-throttle-service.ts` (new).** The request-scoped wrappers
  `isCallerThrottledForCodes` and `recordCallerUnknownCode`. Both fail open and log
  `Discount throttle: …`.
- **`lib/checkout-preview-service.ts`.** The throttle check sits after the empty-cart `null` return
  and before any pricing. An UNKNOWN result is recorded.
- **`features/checkout/place-order.ts`.** The throttle check runs only when a non-blank code was
  submitted, before `createOrder`. A `CheckoutError` with `reason === "UNKNOWN"` is recorded.
- **Docs.** `specs/architecture.md` 1.39.0 has a new invariants bullet.
  `docs/shopper-help/shopping-guide.md` 1.5.0 has one sentence on the wait. CHANGELOG
  `[Unreleased]`.

### Tests and where each requirement's proof lives

| Requirement | Proof |
|---|---|
| R4, R9, R9a, R16, R19 (real-database half) | `scripts/verify-referral-code-integrity.ts`. Modes `backfill`, `concurrent`, `erasure`, `redeem`, `throttle`, or `all`. |
| R6–R8 | `tests/referral-codes.test.ts` |
| R7 (code shape and alphabet) | `tests/referrals.test.ts` |
| **R14** | **`tests/referrals.test.ts`**, case "credits the code's owner, never the ordering shopper, and nobody for an ownerless code". It targets the pure helper `referralBonusRecipient`, which `confirmPayment` (`lib/repositories/orders.ts`, the block after `earnPoints`) uses for exactly this decision. |
| R10, R17 | `tests/referrals-service.test.ts` |
| R13 | `tests/discounts-preview.test.ts`. The existing `#972` suite was switched to `referrerUserId`, and two R13 cases were added. |
| R18 | `tests/rewards-components.test.tsx`. Adds a nested `describe` that stubs `navigator.share`. |
| R19 (unit half) | `tests/discount-code-throttle.test.ts` |
| R20, R21, R24 (preview) | `tests/checkout-preview-throttle.test.ts` |
| R22, R23, R24 (order placement) | `tests/place-order-code-throttle.test.ts` |

Run during Build, not as validation: `verify-referral-code-integrity.ts all` passed every check
against dev. A leak check afterwards found 0 fixture users, 0 owned codes and 0 attempt rows.

## Decisions taken during the build

- **The migration was generated with `prisma migrate diff`, not `migrate dev --create-only`.**
  `migrate dev` demanded a **reset of the dev database**, because
  `20260820200500_p8_image_needs_review` was modified after it was applied (the open issue `#895`,
  commented 2026-10-06). I did not reset. Instead I ran
  `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`,
  which only reads dev. The output had no `DROP` and no `pg_trgm` change, and nothing outside this
  slice, which also shows dev was otherwise in sync. I applied it with `npx prisma migrate deploy`,
  which never resets. The header comment of `migration.sql` records this.
- **A `DISTINCT ON` guard in the backfill,** which the spec did not ask for. If one user somehow had
  two `REF-` rows in the same vendor, a plain `UPDATE … FROM` would give both the same owner, and
  the new unique index would **fail the production migration**. The guard keeps the earliest row
  (`createdAt`, then `id`) and leaves the other ownerless. It cannot occur under the old
  derivation, and the measured row count is 0 everywhere, but a deploy-time failure is the worst
  possible outcome, so the guard costs nothing.
- **`countReferralRedemptions` is a separate repository function, run in parallel with
  get-or-create.** R6 says get-or-create returns the code only. Counting by owner
  (`code: { vendorId, referrerUserId }`) means the count needs no code first, so both reads run
  together. Steady-state cost per signed-in render is two reads. Previously it was one read plus an
  un-awaited write.
- **The relation is named `ReferralCodeOwner`.** `User` already relates to `DiscountRedemption`, so
  an explicit name keeps the new relation unambiguous.
- **The throttle is wrapped in its own service,** not inlined into its two callers. Fail-open and
  logging live in one place, and both callers' tests mock only the repository. That way the
  fail-open logic is the real code under test, not a mock of it.
- **`resolveClientIp` is copied** into the new service, matching the three existing private copies,
  rather than extracted into a shared helper. Extracting it would have meant editing three unrelated
  files. Filed as `#1003`.
- **`hashIp` is exported** from the throttle repository so the tests and the verify script can name
  the stored value. `order-lookup-rate-limit.ts` keeps its own private copy, left untouched.
- **The verify script uses `DATABASE_URL`, the pooled URL,** as the spec says, not `DIRECT_URL` as
  `verify-data-rights.ts` does. The HTTP adapter is the one the Worker uses, and it needs the URL
  the runtime uses. The `count` mode is the only one that accepts `--env-file`. Every writing mode
  refuses it.

## Deviations from the spec

None in the requirements.

- One addition beyond `plan.md`: the backfill's `DISTINCT ON` guard (see Decisions). R4's three
  cases are unaffected.
- Validation row R14 asks for the test file to be named here. It is `tests/referrals.test.ts`.

## Known-shaky areas

- **R15 and R25 (Worker runtime) were NOT run during Build,** deliberately. They are `/validate`'s.
  Two risks are worth extra scrutiny there:
  - get-or-create on `getPrisma()`'s HTTP client **inside the Worker**. The verify script proved the
    HTTP adapter under Node, not under workerd.
  - `StorefrontChrome` now **awaits** a database read, and for a shopper's very first render a
    write. Before, this was fire-and-forget, so a slow database now slows every signed-in page.
    Watch the first render after sign-in.
- **The concurrency proof (R9) passes whether or not the two calls actually interleaved.** If one
  finished before the other started, the second simply read the row. The race path itself
  (violation, then re-read) is covered by unit tests with both error codes. The live run proves only
  that the end state is right. The script does not report which path ran.
- **The throttle under `npm run preview`.** Locally, `cf-connecting-ip` may be absent, in which case
  every caller shares the `"unknown"` bucket. R25 still works because one browser is one caller.
  But a validator running other checks at the same time from the same machine shares the bucket and
  could see the throttle early. Wait 60 s, or check the time, between R25 and anything else that
  submits unknown codes.
- **`placeOrderAction` checks the throttle before `createOrder` but after address validation and
  delivery-pricing checks.** A throttled caller with an invalid address sees the address error
  first. I judged that fine, because the oracle answer is still withheld, but it is worth a look.
- **The full vitest suite timed out three tests on its first run here**:
  - `tests/add-to-cart-feedback.test.tsx`, the known flake `#983`;
  - `tests/motion-reduce-coverage.test.ts` and `tests/token-alpha-purity.test.ts`, which hit 5 s
    under load.

  All three passed alone, and a second full run was green: 218 of 218 files, 2822 tests. None of
  them touches this slice's code. The two source scans read every `.tsx` file, so a slow machine
  times them out. That is pre-existing and not filed.
- **Demo shopper rows on dev.** R15 asks the validator to delete the demo shopper's referral row
  first. Dev had **no** `REF-` rows at Build time, so the first visit creates one.
