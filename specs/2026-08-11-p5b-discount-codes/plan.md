---
id: p5b-discount-codes
title: "P5b — Discount codes: engine, checkout application & staff admin (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-11
visibility: internal
summary: The discounts half of P5 — per-vendor percentage or fixed-amount codes with validity windows, minimum spend and usage caps, claimed inside the checkout transaction, stacking with loyalty points into the one generic discount column, plus a vendor-admin create/deactivate surface.
tags: [p5, discounts, codes, money, checkout, rbac]
related:
  [
    roadmap,
    architecture,
    adr-004-multi-tenancy,
    adr-005-payments-money-flow,
    p3b-checkout-order-core,
    p3c-stripe-payments,
    p5a-loyalty-points,
  ]
---

# P5b — Discount codes: engine, checkout application & staff admin (plan)

Issue **#145**. Phase issue **#88** (P5 — Loyalty & discounts). Second and final P5 slice; P5a
(#135) delivered the loyalty half.

**Goal:** a vendor admin creates a discount code, a shopper enters it at checkout, and it reduces
what they pay — per vendor, without a usage cap ever being exceeded by concurrent checkouts, and
without a code and loyalty points fighting over the same subtotal.

## What this slice does not have to build

P5a shaped `Order.discountPence` as a **generic** discount column rather than a points-specific one,
explicitly so this slice would be additive. That decision pays off literally, and it is worth being
precise about how much it removes from scope:

- `computeTotals(lines, rules, discountPence)` (`lib/order-totals.ts:44`) already takes a discount as
  a parameter. It is the only place an order's money is decided, and everything downstream derives
  from its result — the `Order` row's money columns, `Payment.amountPence`, and the Stripe session
  amount, which P3c deliberately creates *after* the transaction commits from `created.totalPence`.
- So there is **no change to `lib/payments.ts`, no change to `/api/webhooks/stripe`, and no ADR-005
  decision reopened.** By the time the payment path sees an amount, it is simply the amount.
- `eligibleSpendPence()` (`lib/loyalty.ts:34`) already subtracts the *whole* discount when computing
  what an order earns. A code-discounted order therefore earns fewer points **with no new code at
  all**, and codes cannot become a points-farming loophole by construction.
- The discount line already renders on the order pages (`components/orders/OrderItemsCard.tsx:56`)
  and in the confirmation email (P5a). Both keep working; neither needs a new branch.

**`Order` gains no column in this slice.** The link from an order to the code that discounted it
lives on the `DiscountRedemption` row, which carries `orderId`.

## Scope (this slice)

### Pure rules — `lib/discounts.ts`

No I/O, unit-tested without a database — the same split as `lib/loyalty.ts`, `lib/order-totals.ts`,
`lib/cart-rules.ts`, `lib/order-status.ts` and `lib/shopping-list.ts`. Holds code normalisation,
percentage/fixed evaluation, the validity-window and minimum-spend rules, the usage-cap predicates,
and the clamp that stops a code exceeding the goods or driving the payable total below the payment
provider's floor.

`MIN_PAYABLE_PENCE` is **imported from `@/lib/loyalty`, not redefined and not moved.** It is
arguably a payments constant rather than a loyalty one, but ADR-005's P5a implementation note names
`lib/loyalty.ts` as its home in writing; relocating it would invalidate a published ADR note for a
cosmetic gain. One definition, one home, imported where needed.

### Schema — two tables, one enum, nothing altered

`DiscountCode` (per-vendor, `@@unique([vendorId, code])`) and the append-only `DiscountRedemption`
(`@@unique([orderId])`).

**The usage-cap counter counts DOWN, not up.** `DiscountCode.remainingRedemptions` is nullable
(null = unlimited) and the claim guard is `remainingRedemptions: { gt: 0 }` with a
`{ decrement: 1 }`. This is not a stylistic preference — it is forced. The natural shape,
`usedCount < maxRedemptions`, is a **column-to-column comparison**, which Prisma cannot express in a
`where` clause, and `CLAUDE.md` forbids raw SQL in application code. A literal-to-column comparison
is exactly what `Inventory.quantity: { gte: qty }` (P3b) and `balancePoints: { gte: n }` (P5a)
already do, so counting down keeps this slice inside the established pattern instead of reaching for
`$queryRaw`. Postgres arithmetic on `NULL` is `NULL`, so an unlimited code decrements to unlimited
and needs no special case in the write.

A "how many times has this been used" figure for the admin list is **derived from
`DiscountRedemption`**, never stored. Same reasoning P5a used in the opposite direction: there, the
balance had to be a guarded counter because a `SUM()` cannot be compare-and-set; here, the display
count has no concurrency requirement at all, so deriving it means there is no second number that can
disagree with the first.

### Redemption integrity — the third use of a proven pattern

A guarded counter beside an append-only record: `Inventory.quantity`/`OrderItem` (P3b),
`LoyaltyAccount.balancePoints`/`LoyaltyLedgerEntry` (P5a), and now
`DiscountCode.remainingRedemptions`/`DiscountRedemption`. Nothing new is invented.

The **per-customer** cap needs one extra idea, because a plain count-then-write is a race two
concurrent checkouts by the same shopper can both win. `DiscountRedemption.seq` holds the shopper's
zero-based use index for that code, under `@@unique([codeId, userId, seq])`. Two concurrent claims
both compute `seq = 0`, and the database refuses the second — structural, general, and using only
Prisma. Guests are unaffected: their `userId` is null, and repeated nulls do not collide in a
Postgres unique index, which is correct because a code with a per-customer cap refuses guests
outright (see below).

### Stacking — code first, then points

The precedence, decided at `/propose`:

1. `preDiscount = computeTotals(lines, rules)` — the true subtotal, as today
   (`lib/repositories/orders.ts:162`).
2. The **code** is evaluated against that pre-discount subtotal. A percentage code must not shrink
   because the shopper also spent points.
3. **Points** then fill the remaining headroom. `clampRedemption` gains an optional
   `existingDiscountPence` (defaulting to `0`, so every P5a behaviour and test is unchanged) which
   tightens its caps 2 and 3 — the two mechanisms stop each believing it owns the whole subtotal.
4. `computeTotals(lines, rules, codeDiscount + pointsDiscount)` produces the final money.

A code's **minimum-spend qualification is judged on the pre-discount subtotal**, matching how
`minimumOrderPence` and the free-delivery threshold are already judged. One rule for "what the
shopper bought", applied everywhere — spending points must not disqualify a code, for the same
reason it must not claw back free delivery.

### An invalid code fails the checkout — the opposite of an invalid points request

P5a's `redeemPointsIntent` (`features/checkout/place-order.ts:59`) treats anything unparseable as
zero: a malformed redemption must not block an otherwise-valid checkout. **A code does the
opposite** — an unusable code raises a `CheckoutError` with the specific reason, and no order is
created.

The asymmetry is deliberate and is the single most likely thing to be read as an inconsistency
later. Points are a slider the shopper controls against a balance they can see; silently redeeming
zero of them leaves them no worse off. A code is a *claim the shopper believes in*. Silently
ignoring `WELCOME10` and charging full price is a worse outcome than refusing the order and saying
why — the shopper finds out at the card, or doesn't find out at all.

### Release — an abandoned checkout must give the code back

`releaseOrder` (`lib/repositories/orders.ts:339`) already reverses a loyalty `REDEEM` when an unpaid
order is cancelled. A code redemption is released in that same transaction. Without it, every
abandoned checkout permanently burns a use, and a 100-use launch code dies quietly without a single
paid order.

**The release deletes the `DiscountRedemption` row rather than writing a reversal**, which is a
deliberate asymmetry with the loyalty ledger and needs its reason on the record. The loyalty ledger
is append-only because it is a *financial* audit trail of a balance that persists between orders. A
discount redemption on a never-paid order is not a financial event: nothing moved, and the
`CANCELLED` `Order` row is itself the audit trail of what happened. Deleting also frees the shopper's
`seq` slot, so an abandoned checkout does not consume one of their per-customer uses — which a
reversal row would, unless the count learned to exclude reversed rows, at which point `seq` would
collide with the row it was told to ignore.

### Checkout, admin and seed

- **Checkout**: a `discountCode` field beside the existing points input; server-side validation with
  a distinct message per refusal reason; claimed inside the existing checkout transaction, ahead of
  the points debit.
- **`/staff/discounts`**: vendor-ADMIN gated, mirroring `/staff/loyalty`. **Create, list, and
  deactivate.** The actions call `requireVendorRole("ADMIN")` themselves rather than trusting the
  page that rendered the form — a server action is a public endpoint at a stable id.
- **Seed**: one sample code for Aheed, none for SriMart, which is what proves it is per-vendor data.

## Deliberately excluded

- **Editing a code after creation.** Changing a live code's value asks whether past orders re-price
  — they must not — and creates a window where two shoppers used "the same code" at different rates.
  Deactivate and create a replacement. Only `isActive` changes after creation.
- **Product- or category-scoped codes** ("20% off fresh produce"). Needs a join from the code to the
  catalogue and a per-line discount model; `Order.discountPence` is an order-level figure.
- **Auto-applied promotions** with no code entered.
- **More than one code per order** — `@@unique([orderId])` on the redemption enforces exactly one.
- **First-order-only / new-customer eligibility.** Needs an order-history query inside the checkout
  transaction plus a decision about guests, who have no history to check.
- **Referral codes**, which are an identity feature wearing a discount's clothes.
- **A per-vendor `discountsEnabled` flag.** P5a needed `loyaltyEnabled` because loyalty is a set of
  rates that exist whether or not the vendor wants a scheme. Codes are self-gating: a vendor with no
  codes has no discounts, so the flag would carry no information a `COUNT` doesn't already. This is
  also why P5b cannot repeat #143's ship-dark failure — seeding a code *is* enabling the feature.
- **Naming the applied code on the order pages or in the confirmation email.** The amount shows; the
  code that produced it does not. Same family as #138 (points earned on those pages) and best done
  once, for both.
- **Reversing a code use on a refund.** `releaseOrder` acts only on `PENDING_PAYMENT`, so a *paid*
  order's code cannot be released today by any code path — the same structural reason #137 records
  for earn reversal. It arrives with refunds (ADR-005 territory).

## Open items carried forward

- **#143** — loyalty is in production but dark. P5 cannot close on P5b's promotion alone; enabling
  requires an owner decision on live rates. Independent of this slice's correctness.
- **#104** — Resend still has no verified sending domain, so the confirmation email's discount line
  remains unprovable at inbox level in any environment. Structurally checkable properties are in
  scope; inbox delivery is not.
- **#141** — P5a's cross-vendor admin write was tested in one direction only. This slice's admin
  requirements test **both** directions rather than repeating that gap.

## Riders on this branch (carry-forward rule)

Post-merge doc corrections ride the next slice's branch, so this one carries:

- **#144** — backfill P5a's promotion row in `specs/roadmap.md`. `npm run sdd:audit` is clean and
  will stay clean; it cannot see a missing *promotion* row.
- **`secrets/production.vars` holds staging's `CDN_BASE_URL`** while its `S3_BUCKET` correctly says
  production. The live Worker is correct, so this is a latent file defect that `configure-env
  production` would turn into a real one. Same shape as #111 in the same file, different key.
