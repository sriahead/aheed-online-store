# #991, #987, #988 — Referral and discount-code integrity (requirements / acceptance criteria)

This slice closes `#991` (a shopper's referral code row is created fire-and-forget with every
error swallowed, so the code shown can be unredeemable), `#987` (the code's owner is only a
`description` string, and two users can derive the same code) and `#988` (discount-code checks are
an unthrottled existence oracle). Gate 1 was approved by the owner on 2026-10-06; the scope and the
owner's two choices (random stored codes; throttle unknown codes only) are in the "Gate 1" comment
on each issue. The reasoning and the deliberately-excluded list are in `plan.md`, which a validator
should read first.

Terms used below:

- **Spec folder:** `specs/2026-10-06-p991-987-988-referral-code-integrity/`.
- **The migration:** the single new directory this slice adds under `prisma/migrations/`, whose
  name ends `_p987_988_referral_owner_code_throttle`.
- **Verify script:** `scripts/verify-referral-code-integrity.ts`, run with `npx tsx` against the
  dev database. It builds clients from the bare `@prisma/client` with `@prisma/adapter-neon`, as
  `scripts/verify-data-rights.ts` does. It creates its own fixture vendor-scoped users and codes,
  and deletes every row it created before it exits, including after a failed assertion.
- **The throttle message:** `Too many code attempts. Please try again in a minute.`
- **The unavailable sentence:** `Your referral link isn't available right now. Please try again
  later.`

## Measurement before change (`#991`)

R1. The spec folder's `build-notes.md` records, separately for **staging** and **production**, and
    measured **before** the migration is applied there:
    - the number of `DiscountCode` rows whose `code` starts `REF-`;
    - how many of those have a `description` of the form `Referral from user <id>` where `<id>` is
      an existing `User.id`.

    It also records the exact read-only command used and the date. If either environment could not
    be measured, it says so and why, rather than leaving the field blank.

## Schema and migration (`#987`, `#988`)

R2. `prisma/schema.prisma` declares all of the following:
    - `DiscountCode.referrerUserId String?`, with a relation to `User` that has
      `onDelete: SetNull`;
    - `@@unique([vendorId, referrerUserId])` on `DiscountCode`;
    - a back-relation list on `User`;
    - a model `DiscountCodeAttempt` with exactly the fields `id` (uuid default), `vendorId` (relation
      to `Vendor`), `ipHash String` and `createdAt DateTime @default(now())`, and
      `@@index([vendorId, ipHash, createdAt])`.

R3. The migration's `migration.sql` adds the `referrerUserId` column, its foreign key with
    `ON DELETE SET NULL`, the unique index on `("vendorId", "referrerUserId")` and the
    `DiscountCodeAttempt` table with its index and vendor foreign key. It contains no
    `DROP INDEX`, `DROP TABLE` or `DROP COLUMN` statement.

R4. The migration's backfill does all three of the following, and the verify script proves it
    (mode `backfill`). That mode runs the migration file's own backfill statements inside a
    transaction against fixture rows, asserts the results, then rolls back.
    - (a) A `REF-` row whose `description` is exactly `Referral from user <id>`, with `<id>` an
      existing user, gets `referrerUserId = <id>` and `description = 'Customer referral code'`.
      Its `code` is unchanged.
    - (b) A `REF-` row naming a user id that does not exist is left entirely unchanged, with
      `referrerUserId` still `NULL`.
    - (c) A row whose `code` does not start `REF-` is left entirely unchanged, even if its
      `description` reads `Referral from user <existing id>`.

R5. After `npx prisma migrate deploy` against the dev database, `npx prisma migrate status` reports
    the database schema is up to date.

## Referral code ownership and generation (`#987`, `#991`)

R6. `lib/repositories/referral-codes.ts` exports
    `getOrCreateReferralCode(prisma, vendorId, userId)`. It returns the `code` of the `DiscountCode`
    row with that `vendorId` and `referrerUserId = userId` when one exists, and creates no row.

R7. When no such row exists, `getOrCreateReferralCode` creates exactly one row with all of these
    values, and returns its `code`:
    - `code` matching `^REF-[A-HJ-NP-Z2-9]{8}$`;
    - `referrerUserId = userId`;
    - `description = 'Customer referral code'`;
    - `kind = FIXED_AMOUNT`, `value = REFERRAL_DISCOUNT_PENCE`,
      `minSubtotalPence = MIN_REFERRAL_ORDER_PENCE`;
    - `maxPerCustomer = 1`, `remainingRedemptions = null`, `isActive = true`.

    The 8 characters come from `crypto.getRandomValues`.

R8. A unique violation on create is recognised with `isUniqueViolation`
    (`lib/repositories/prisma-errors.ts`), so both `P2002` and `23505` are accepted. On such a
    violation, `getOrCreateReferralCode` re-reads by owner:
    - if a row is now found, it returns that row's code;
    - otherwise it retries with a freshly generated code, for at most 5 create attempts in total,
      and then throws.

    A non-unique error is rethrown, not retried. Unit tests cover:
    - an owner-found-on-re-read case, for each of `P2002` and `23505`;
    - a code-collision-then-success case;
    - a 5-collisions-then-throw case;
    - a non-unique error that is rethrown after exactly one create attempt.

R9. Against the real dev database (verify script, mode `concurrent`), two concurrent
    `getOrCreateReferralCode` calls for the same fresh fixture user leave exactly one row for that
    user, and both calls return that row's code. The mode runs this twice: once with both calls on
    an HTTP-adapter client (`PrismaNeonHttp`) and once on a WebSocket-adapter client (`PrismaNeon`).

R9a. Against the real dev database (verify script, mode `erasure`), deleting a fixture user who
     owns a referral code leaves the code row in place, with `referrerUserId` now `NULL` and its
     `code` unchanged. `DiscountRedemption` rows cascade only from the code row, never from its
     owner, so a surviving code row means its redemptions survive too.

R10. `getReferralStats` (`lib/referrals-service.ts`) obtains the code by awaiting
     `getOrCreateReferralCode`. If that call throws, `getReferralStats` logs with `console.error`, in
     a message starting `Referrals:`, and returns `referralCode: ""` with `completedCount: 0`. It
     does not throw.

R11. No file under `lib/`, `app/`, `components/` or `features/` calls or imports
     `ensureReferralDiscountCode`. Neither `app/(storefront)/account/loyalty/page.tsx` nor
     `lib/rewards-service.ts` contains the text `.catch(() => {})`.

R12. `lib/referrals.ts` no longer exports `generateReferralCode`, `extractReferrerUserId` or
     `isUsersOwnReferralCode`. No file under `lib/`, `app/`, `components/`, `features/` or `tests/`
     calls any of them, checked by searching for each name followed by `(`.

R13. `previewCode` (`lib/repositories/discounts.ts`) refuses with `OWN_REFERRAL_CODE` exactly when
     the code row's `referrerUserId` is non-null and equals `input.userId`. A vitest test shows two
     things:
     - a row with `referrerUserId: null` and `description: 'Referral from user u-1'` is **not**
       refused for `userId: 'u-1'`, which proves the description is no longer read;
     - a row with `referrerUserId: 'u-1'` **is** refused for `userId: 'u-1'`.

R14. `confirmPayment` (`lib/repositories/orders.ts`) calls `awardReferralBonusPoints` with the
     redeemed code's `referrerUserId` exactly when that value is non-null and differs from the
     order's `userId`. A vitest test covers all three cases: a different owner (called once),
     a `null` owner (not called) and the same user (not called). The test may target
     `confirmPayment` directly, or a pure helper that `confirmPayment` uses for exactly this
     decision.

R15. Under `npm run preview` (verify in the validation steps), a signed-in shopper with no referral
     row does the following:
     - Loading `/account/loyalty` once leaves exactly one `DiscountCode` row with
       `referrerUserId` equal to that shopper, and the page's HTML contains that row's `code`.
     - Loading the page a second time leaves the row count for that shopper at one, and shows the
       same code.
     - A storefront page render (`/`) for the same shopper also creates no second row.

R16. The code created in R15 is redeemable by **another** signed-in shopper. `previewCode` for that
     code, with a subtotal of at least `MIN_REFERRAL_ORDER_PENCE`, returns
     `{ ok: true, discountPence: REFERRAL_DISCOUNT_PENCE }`. Verified by the verify script, mode
     `redeem`, against a fixture code it creates.

## Empty-code rendering (`#991`)

R17. When `getReferralStats` returns an empty `referralCode`, both the loyalty page and
     `getRewardsDataForUser` pass `referralUrl: ""`. Neither ever produces a URL ending `?ref=`.
     A vitest test asserts this for `getRewardsDataForUser`.

R18. `ReferralCard` with `authenticated` true and an empty `referralCode` renders the unavailable
     sentence. It renders no element with the accessible name `Share referral link`, and no
     Facebook, X, WhatsApp or email share link. A test in `tests/rewards-components.test.tsx`
     asserts this. The existing cases in that file still pass.

## Throttle (`#988`)

R19. `lib/repositories/discount-code-throttle.ts` exports two functions:
     - `isDiscountCodeCheckThrottled(prisma, vendorId, ip)`, which returns `true` exactly when
       there are at least 10 `DiscountCodeAttempt` rows for that `vendorId` and that IP's hash with
       `createdAt` in the last 60 seconds;
     - `recordUnknownDiscountCode(prisma, vendorId, ip)`, which creates one row whose `ipHash` is
       the lowercase hex SHA-256 of the IP and never the raw IP. With probability 0.01 it also
       deletes rows older than one hour.

     Unit tests cover the 9/10 boundary, the hash and the sweep. Against the real dev database
     (verify script, mode `throttle`), after 10 recorded attempts for one fixture vendor and IP:
     - that vendor and IP is throttled;
     - the same IP on a second fixture vendor is not throttled;
     - a different IP on the same vendor is not throttled.

R20. `CodeRefusalReason` (`lib/discounts.ts`) gains `TOO_MANY_ATTEMPTS`, and `refusalMessage`
     returns the throttle message for it.

R21. `previewCheckoutCode` (`lib/checkout-preview-service.ts`) behaves as follows when there is a
     cart to preview against. A vitest test with mocked dependencies covers every case.
     - If the caller is throttled, it returns
       `{ code, ok: false, message: <the throttle message> }` without calling the discount
       repository's `preview`.
     - It calls `recordUnknownDiscountCode` once when the preview's reason is `UNKNOWN`.
     - It does not call it for any other refusal reason, or for a successful preview.

R22. `CheckoutError` (`lib/repositories/orders.ts`) has an optional `reason` of type
     `CodeRefusalReason`. Both `throw new CheckoutError("DISCOUNT_CODE", ...)` sites set it to the
     refusal's reason.

R23. `placeOrderAction` (`features/checkout/place-order.ts`) behaves as follows. A vitest test with
     mocked dependencies covers every case.
     - When the form carries a non-blank discount code and the caller is throttled, it returns
       `{ error: <the throttle message> }` without calling `placeOrder`.
     - When `placeOrder` throws a `CheckoutError` with `reason: "UNKNOWN"`, it calls
       `recordUnknownDiscountCode` once.
     - It does not call it for any other `CheckoutError`.
     - With a blank code, it does not consult the throttle.

R24. The throttle fails open. If `isDiscountCodeCheckThrottled` or `recordUnknownDiscountCode`
     throws, the error is logged with `console.error`, in a message starting `Discount throttle:`,
     and the code check or order placement proceeds as if not throttled. Vitest tests cover this in
     both `previewCheckoutCode` and `placeOrderAction`.

R25. Under `npm run preview`, in a browser on the checkout page with a non-empty cart:
     - pressing **Apply** with 10 different unrecognised codes shows "That discount code isn't
       recognised." each time;
     - the 11th **Apply**, with a valid active code, shows the throttle message;
     - after waiting at least 60 seconds from the first attempt, the same valid code applies.

## Documentation, Gate 4, Gate 3

R26. Two persistent docs are updated:
     - `specs/architecture.md` states, in the same bullet or paragraph, that a referral code's owner
       is `DiscountCode.referrerUserId` and that unknown discount codes are throttled per vendor and
       hashed IP;
     - `docs/shopper-help/shopping-guide.md` tells shoppers that after several unrecognised codes
       the checkout asks them to wait a minute.

     Each file's `version` and `updated` front-matter fields are bumped.

R27. `npm run kms:validate` exits 0. `npm run kms:build-index` followed by
     `npm run kms:check-generated` exits 0. `npm run kms:assemble:internal`, then
     `npx next build --webpack` in `kms/site-internal`, exits 0.

R28. `CHANGELOG.md` is updated (Gate 4), with an entry naming `#991`, `#987` and `#988`.

R29. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone), `npm run format:check` and
     `npm run build` all exit 0 after this slice.
