---
id: p991-987-988-referral-code-integrity-plan
title: "#991, #987, #988 — Referral and discount-code integrity (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-06
visibility: internal
summary: A shopper's referral code row is created reliably, owned by a real foreign key and random rather than derived from the user id, and unrecognised discount codes are throttled per vendor and hashed IP. One additive migration with a backfill.
tags: [storefront, checkout, discounts, loyalty, referrals, security, p10]
related: [p973-957-753-972-checkout-cart-honesty-plan, p956-967-add-feedback-referral-total-plan]
---

# #991, #987, #988 — Referral and discount-code integrity (plan)

The narrative: why this slice exists, what it proves, and where its edges are. `requirements.md`
holds the checkable acceptance criteria; this file holds the reasoning a reader needs to trust
those requirements are the right ones.

**Goal:** a shopper's referral code is a real, redeemable row from the first time they see it, it
belongs to them by a foreign key rather than a description string, and nobody can test discount
codes at the speed of a server action. All three issues are defensive hardening found by the
`#972`/`#973` slice. **The platform has never traded**, so none of this repairs a measured loss.

Gate 1 was approved by the owner on 2026-10-06. The record is the "Gate 1 — approved scope" comment
on each of `#991`, `#987` and `#988`, including the two owner choices quoted below.

## What is true today (read from the code on 2026-10-06)

- **`#991` — the row is created fire-and-forget, with every error discarded.**
  `ensureReferralDiscountCode` (`lib/referrals-service.ts`) wraps an `upsert` in `try {} catch {}`.
  It is called **without `await`**, with `.catch(() => {})`, from two places:
  `app/(storefront)/account/loyalty/page.tsx` and `lib/rewards-service.ts`. The second runs from
  `components/layout/StorefrontChrome.tsx` and `app/api/rewards/route.ts`, so it fires on **every
  storefront render for a signed-in shopper**. Under `npm run preview`, two visits to the loyalty
  page left no `REF-` row. Until a row exists, the code the page displays and shares is answered
  "That discount code isn't recognised." at checkout. Whether production has any rows is unknown,
  so it is the first thing the build measures (R1).
- **`#987` — the owner is a string, and two users can derive the same code.**
  `generateReferralCode` (`lib/referrals.ts`) keeps only the first 8 alphanumeric characters of the
  user id. The `upsert` uses `update: {}`, so a code belongs to whoever created it first. The owner
  is recorded only in `description` as `Referral from user <id>`. Two money paths read that string
  back with `extractReferrerUserId`:
  - the `#972` own-code refusal in `previewCode` (`lib/repositories/discounts.ts`), and
  - the referrer's bonus points in `confirmPayment` (`lib/repositories/orders.ts`, the
    `awardReferralBonusPoints` call).
- **`#988` — the Apply control is an existence oracle.** `previewDiscountCode`
  (`features/checkout/preview-code.ts`) calls `previewCheckoutCode`
  (`lib/checkout-preview-service.ts`). Its refusal tells an unknown code ("isn't recognised") apart
  from every other reason, needs only a non-empty cart, and has no rate limit. `placeOrder` has the
  same oracle through `CheckoutError("DISCOUNT_CODE", refusalMessage(...))`.
- **Reusable precedent.**
  - `OrderLookupAttempt` with `lib/repositories/order-lookup-rate-limit.ts` is a fixed-window
    Postgres throttle keyed on vendor and a SHA-256 IP hash, with a probabilistic retention sweep.
  - `isUniqueViolation` (`lib/repositories/prisma-errors.ts`) already accepts both `P2002` and
    `23505`.
  - Data backfills inside a migration have precedent: `20260919113731_p363_vendor_timezone` and
    `20260926180000_p905_vendor_product_label_settings`.

## Scope (this slice)

### `#991` — create the row reliably, on read

- `getReferralStats(userId)` becomes **get-or-create**. It reads the shopper's own code by owner. If
  there is none, it creates one and waits for the result before returning. In steady state that costs
  one read per render, and a write only once per shopper per vendor.
- Both `ensureReferralDiscountCode(...).catch(() => {})` calls are deleted, and so is
  `ensureReferralDiscountCode` itself. Nothing is left running after the response is sent.
- A unique violation on create is treated as "another request created it" or "that code is taken".
  It is never swallowed silently. Any other error is logged with `console.error` and a stable
  prefix, `Referrals:`, so it reaches Workers Logs. The page still renders, because a broken referral
  card must not take down the storefront chrome. When that happens, `getReferralStats` returns an
  **empty** `referralCode` rather than a code that does not exist.
- **Today an empty code is not handled for a signed-in shopper.** `ReferralCard`
  (`components/rewards/ReferralCard.tsx`) falls back to `window.location.origin` when `referralUrl`
  is empty. It then offers to share the plain store URL under "give your friends £5 off", and
  `buildReferralUrl(base, "")` would produce a bare `?ref=`. So this slice makes three changes:
  - both callers (the loyalty page and `getRewardsDataForUser`) pass `referralUrl: ""` when the code
    is empty;
  - `ReferralCard`, when `authenticated` and `referralCode` is empty, renders the sentence "Your
    referral link isn't available right now. Please try again later." in place of the link box and
    the share buttons;
  - the header share button (`navigator.share`) is not rendered in that case either.

### `#987` — a real owner and a random code

- **Schema:** `DiscountCode.referrerUserId String?`, a foreign key to `User.id` with
  `onDelete: SetNull` and `@@unique([vendorId, referrerUserId])`. Postgres allows many `NULL`s
  under a unique index, so ordinary staff-created codes (owner `NULL`) are unaffected.
  `User.referralCodes DiscountCode[]` is the back-relation.
- **Backfill, in the same migration:** for every `DiscountCode` whose `code` starts `REF-` and whose
  `description` is exactly `Referral from user <id>`, where `<id>` is an existing `User.id`, set
  `referrerUserId` to that id. Then rewrite those rows' `description` to `Customer referral code`, so
  the user id no longer sits in free text. Rows whose described user does not exist are left
  untouched, with an owner of `NULL`. Their codes still redeem as discounts but credit nobody, which
  is exactly what the old code did when its `awardReferralBonusPoints` foreign key would have
  failed.
- **Why `SetNull`, not `Cascade`:** `DiscountRedemption` rows reference the code. Cascading a
  shopper's erasure (`lib/repositories/data-rights.ts` deletes the `User`) into their code would
  delete other shoppers' redemption history. After erasure the code keeps working as a £5 welcome
  code, and nobody earns referral points from it.
- **Owner choice — random stored codes.** New codes are `REF-` plus 8 characters drawn with
  `crypto.getRandomValues` from `A–Z` and `2–9`, leaving out `0`, `1`, `O` and `I` so a code read
  aloud or retyped is not ambiguous. The result still matches `extractReferralPrefix`'s
  `^REF-[A-Z0-9]{4,16}$`. A collision with an existing code retries with a fresh code, at most 5
  attempts. A collision on the owner index means a concurrent request already created this shopper's
  code, so the function re-reads by owner and returns that. A shopper's code is **looked up by
  owner, never re-derived from the user id**.
- **Existing rows keep their exact `code` values**, so any link already shared keeps working.
  A shopper who was **shown** a derived code that was never persisted (`#991`) gets a new random
  code. Their old link was already answered "isn't recognised", so nothing that worked stops
  working.
- **Both money paths read the foreign key:**
  - **Own-code refusal:** `previewCode` refuses `OWN_REFERRAL_CODE` when `row.referrerUserId` is
    non-null and equals `input.userId`. The `REF-` shape check is no longer needed, because only
    referral codes carry an owner.
  - **Points credit:** `confirmPayment` awards referral points when the redeemed code's
    `referrerUserId` is non-null and differs from `order.userId`.
- **Helpers retired** (their only callers are the ones replaced above): `generateReferralCode`'s
  user-id derivation, `extractReferrerUserId`, `isUsersOwnReferralCode` and the `REF_NOCAPED`
  fallback. `tests/referrals.test.ts` is updated to match. `extractReferralPrefix`, `isSelfReferral`,
  `buildReferralUrl` and `buildShareLinks` stay.
- Data access goes in a new pure repository, `lib/repositories/referral-codes.ts`. Like every
  repository it takes the client, `vendorId` and `userId` as parameters and reads no request
  context. `lib/referrals-service.ts` stays the request-scoped facade.

### `#988` — throttle unrecognised codes

- **Owner choice — throttle unknown codes**, not collapse messages. A new model,
  `DiscountCodeAttempt { id, vendorId (FK Vendor), ipHash, createdAt }`, has
  `@@index([vendorId, ipHash, createdAt])`. Its repository is
  `lib/repositories/discount-code-throttle.ts`, which hashes the IP exactly as
  `order-lookup-rate-limit.ts` does.
- **Only UNKNOWN results are recorded.** A shopper typing real codes, including expired or
  below-minimum ones, is never throttled. **The limit is 10 unknown results per vendor per hashed IP
  in a fixed 60-second window.** Once a caller has 10 in the window, every further code check from
  them is refused **without looking the code up**, under a new reason `TOO_MANY_ATTEMPTS`. Its copy
  is "Too many code attempts. Please try again in a minute."
- Retention follows `#468`'s precedent: rows older than one hour are swept by a `deleteMany` with
  probability 0.01 per recorded attempt. That runs on the HTTP client, where `deleteMany` is safe.
- **Enforced in both places the oracle exists:**
  - `previewCheckoutCode` checks the throttle before calling the discount repository and records an
    attempt when the result is `UNKNOWN`. This covers the Apply action and the checkout page's
    cookie pre-fill, since a cookie is attacker-controlled too.
  - `placeOrderAction` (`features/checkout/place-order.ts`), when the form carries a code, checks the
    throttle before calling `placeOrder` and returns the same message if the caller is throttled.
    When `placeOrder` throws `CheckoutError` with code `DISCOUNT_CODE`, the action records an attempt
    only if the refusal reason is `UNKNOWN`. To make that decidable without comparing message text,
    `CheckoutError` gains an optional `reason?: CodeRefusalReason`, set on both `DISCOUNT_CODE`
    throws in `lib/repositories/orders.ts`.
- **The IP is read the way the codebase already does it:** `cf-connecting-ip`, then the first
  `x-forwarded-for`, then `"unknown"`. Locally every caller shares the `"unknown"` bucket, which is
  acceptable for development and does not happen on a Worker.
- **The throttle fails open.** If the throttle's own query throws, the error is logged with the
  prefix `Discount throttle:` and the code check proceeds. A broken throttle must not stop every
  shopper from checking out.
- **The throttle is best-effort, not compare-and-set,** the same accepted trade
  `checkOrderLookupRateLimit` documents. Concurrent requests can each get one extra try inside a
  window.

## Deliberately excluded

- **Collapsing "unknown" and "inactive" into one message.** That was the owner's rejected
  alternative for `#988`.
- **A Cloudflare rate-limiting binding.** None is provisioned, and adding one is new infrastructure
  (`CLAUDE.md` hard stop).
- **`#989`** (bundle add-to-basket notice) sits in the same area but is unrelated.
- **Honouring derived codes that were displayed but never persisted.** Those links never worked
  (`#991`). Re-creating them would keep codes derivable from user ids, which the owner chose to move
  away from.
- **Including referral codes in the shopper's data-rights export,** and staff UI changes to show
  or filter referral codes. Neither is needed for integrity, and both would widen the slice.
- **Throttling staff code management, or signed-in shoppers by user id.** The throttle is per IP
  only, matching every other throttle in the codebase.
- **Proving the throttle under real traffic.** That needs a deployed environment and a scripted
  load. The rule is proven against a real database (R14) and through the Worker locally (R19).

## Open items carried forward

- **`#991`'s production measurement (R1)** needs production database access, which auto mode
  blocks. The build hands the owner a read-only `!` command. If production already holds `REF-` rows
  owned by real users, the backfill keeps them and their codes. If it holds none, the backfill is a
  no-op there.
