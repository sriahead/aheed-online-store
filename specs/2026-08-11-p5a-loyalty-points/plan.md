---
id: p5a-loyalty-points
title: "P5a — Loyalty points: earn, redeem, tiers, expiry & admin config (plan)"
audience: [dev]
type: spec
status: draft
version: "1.1.0"
updated: 2026-08-11
visibility: internal
summary: The loyalty half of P5 — a per-vendor points ledger earned on payment confirmation, redeemable at checkout through computeTotals, with tier multipliers, inactivity expiry derived at read time, a customer balance page and an admin config surface.
tags: [p5, loyalty, points, money, checkout, rbac]
related:
  [
    roadmap,
    architecture,
    adr-004-multi-tenancy,
    adr-005-payments-money-flow,
    p3b-checkout-order-core,
    p3c-stripe-payments,
    p4a-order-history,
    p4b-order-status-transitions,
  ]
---

# P5a — Loyalty points: earn, redeem, tiers, expiry & admin config (plan)

Issue **#135**. Phase issue **#88** (P5 — Loyalty & discounts). First P5 slice; the discounts engine
is P5b.

**Goal:** a shopper earns points on what they actually pay, sees them on their account, and spends
them against a later order — per vendor, without a single new piece of infrastructure, and without
either the customer or a concurrent request being able to spend the same point twice.

## Why loyalty before the discounts engine

P5's roadmap line reads *"Points earn/redeem; discounts engine; admin configuration."* Loyalty goes
first for a reason that is about configuration, not features. Loyalty's settings are per-vendor
numbers, which is exactly the shape `VendorConfig` already holds for `deliveryFeePence`,
`freeDeliveryThresholdPence` and `minimumOrderPence` — so it extends an established table rather
than inventing a surface. A discount **code**, by contrast, is created ad hoc and therefore needs a
creation UI, which drags P6's admin-panel question forward into P5. The AI Studio mockup
(`docs/ui-ref/`, the reference P2.5 was built to) agrees on the emphasis: `CustomerAccountView.tsx`
carries a complete Loyalty tab, while `CheckoutModal.tsx` has only an inert `discountPence: 0` and
no code-entry UX at all.

## The seam this is built on

There is exactly one place in this codebase where money is decided: `computeTotals(lines, rules)`
in `lib/order-totals.ts` — pure, I/O-free, unit-tested — called once inside the checkout
transaction at `lib/repositories/orders.ts:142`. Everything downstream derives from its result: the
`Order` row's three money columns, `Payment.amountPence`, and the Stripe session amount, which P3c
deliberately creates *after* the transaction commits from `created.totalPence`.

That means **a redemption that lands inside `computeTotals` is automatically correct all the way to
Stripe** — no ADR-005 change, no change to `lib/payments.ts`, and no change to the webhook's amount
handling. This slice extends `computeTotals` with a discount and changes nothing else in the money
path.

## Scope (this slice)

### Schema — one additive migration

- **`LoyaltyLedgerEntry`** — append-only, vendor- and user-scoped, one row per movement:
  `kind` (`EARN` / `REDEEM` / `REVERSAL`), a **signed** `points` (earn positive, redeem negative),
  the `orderId` it originated from, and — on `EARN` only — the tier key and multiplier that applied,
  so a historical earn stays explainable after the tier table changes underneath it.
- **`LoyaltyAccount`** — one row per `(vendorId, userId)` holding `balancePoints`, `lifetimePoints`
  and `lastActivityAt`. This is **not** a redundant cache of the ledger; it is the concurrency
  anchor, and the pairing is the same one this schema already uses for stock: `Inventory.quantity`
  is the guarded counter and `OrderItem` is the record of what moved. A balance derived by `SUM()`
  cannot be compare-and-set, and every other contended resource in this codebase is protected that
  way (P3b's stock decrement, P4b's status advance).
- **`VendorLoyaltyTier`** — per-vendor tier rows (`key`, `name`, `thresholdPence`, `multiplierBps`).
  Multipliers are **basis points**, never floats, for the same reason money is pence.
- **`VendorConfig`** gains the loyalty settings (`loyaltyEnabled`, `pointsPerPoundEarned`,
  `pencePerPointRedeemed`, `minRedeemPoints`, `pointsExpiryMonths`, `tierWindowDays`), all with
  Prisma-level defaults so an existing vendor row stays valid without a backfill.
- **`Order.discountPence`**, defaulting to `0`. Deliberately a **generic money column, not a
  points-specific one** — P5b's discount codes reduce the same total, and they must not need a
  second column and a second arithmetic rule.

### Pure rules — `lib/loyalty.ts`

All the thinking, with no I/O, tested without a database (the split `lib/order-totals.ts`,
`lib/cart-rules.ts`, `lib/order-status.ts` and `lib/shopping-list.ts` already use):

- **Eligible spend is `subtotalPence - discountPence`.** Delivery is not goods, so it earns nothing;
  and excluding the discount is what stops redeemed points from re-earning points, which would
  otherwise be a slow value leak with no obvious symptom.
- **Earning** floors to whole pounds, then applies `pointsPerPoundEarned` and the tier multiplier in
  basis points, flooring again — integer arithmetic end to end.
- **Clamping a redemption** is where the sharp edges are, and all three are enforced here rather
  than hoped for at the call site: a redemption never exceeds the subtotal; it never drives the
  payable total below `MIN_PAYABLE_PENCE` (30p — below Stripe's GBP minimum a session cannot be
  created at all, and the order would exist with no way to pay for it); and the points actually
  spent are **recomputed from the clamped pence**, so a shopper is never debited points that did not
  reduce their bill.
- **Lapse** is `now - lastActivityAt > pointsExpiryMonths`, with `null` meaning points never expire.

### Where each movement happens

| Movement | Where | Why there |
|---|---|---|
| `REDEEM` | inside `placeOrder`'s existing transaction | atomic with the order it discounts; a rolled-back checkout cannot leave points spent |
| `EARN` | inside `confirmPayment`'s existing transaction | the money is real only once Stripe confirms, and that path is already idempotent |
| `REVERSAL` | inside `releaseOrder`'s existing transaction | an abandoned checkout must return the points it held |

No new transaction, no new service, no new endpoint. Each of the three writes is guarded by
`@@unique([orderId, kind])`, so a duplicate Stripe delivery or a double submit is refused by the
database rather than by a check that has to be remembered.

### Redemption is an *intent*, never an amount

The checkout form carries a **points count** and nothing else. The discount in pence is recomputed
server-side inside the transaction from the persisted balance, exactly as P3b already recomputes the
subtotal rather than trusting the form. The spend itself is a conditional `updateMany` requiring
`balancePoints >= n` **and** a non-lapsed `lastActivityAt` **and** the matching `vendorId` — so two
concurrent checkouts cannot both spend the same points, and one vendor's points are not merely
rejected at another vendor, they are unmatchable.

### Surfaces

- **`/account/loyalty`** — balance, its cash value, lifetime earned, current tier and progress to
  the next, and the ledger as history.
- **`/staff/loyalty`** — the mockup's admin-only Loyalty Config, on the `/staff` segment P4b created
  for exactly this, gated to vendor **ADMIN** (not STAFF) via `requireVendorRole`. Edits the
  `VendorConfig` settings and the threshold/multiplier of existing tier rows.
- **Checkout** — a points input shown only when the vendor has loyalty on and the shopper has a
  usable balance.

### One existing surface that must not be left inconsistent

`features/checkout/send-confirmation.ts` renders **Subtotal / Delivery / Total**. The moment a
discount exists, those three lines stop reconciling and the customer receives an email whose
arithmetic is visibly wrong. The confirmation email therefore gains a discount line. This is a
correction forced by the slice, not a new email — no additional message is sent, and P4b's status
emails (which render only the total) are untouched.

### Persistent docs updated by this slice

- **`specs/architecture.md`** — the order money identity becomes
  `subtotal − discount + delivery = total`, and §5's "Order placement decrements stock…"
  multi-table-transaction guidance now also names the points movement.
- **`specs/decisions/ADR-005-payments-money-flow.md`** — a P5a implementation note, additive
  alongside P3c's, recording that a redemption reduces the amount *before* the Stripe session is
  created (so the port and the webhook are unchanged) and why `MIN_PAYABLE_PENCE` exists. **No
  ADR-005 decision is reopened.**

## Rationale for the two decisions most likely to be questioned

**Expiry is derived, not swept.** `wrangler.toml` declares no cron triggers, and this slice will not
add scheduling infrastructure for a rule that needs none. `lastActivityAt` plus a comparison at read
time reproduces the mockup's stated rule ("points last as long as you place 1 order per 12 months")
exactly, and a lapsed account is refused at redemption by the same `updateMany` guard that prevents
double-spending — so the rule is enforced at the write, not merely displayed. The one consequence
worth stating: a lapsed account's stored `balancePoints` is stale until its next earn, which
**resets** the balance rather than incrementing it. Rejected: per-entry aging (each earn expiring 12
months after it was earned), which is a different product rule from the one the mockup states and
would need either a sweep job or a windowed sum on every read.

**Tier is a rolling window, not lifetime spend.** The mockup says "Shop £80 more **this month** to
unlock Gold", so tier reflects recent custom, not accumulated custom. `tierWindowDays` makes the
window per-vendor data rather than a constant. The applied multiplier is snapshotted onto the
`EARN` row because tier is computed from a query whose answer changes over time, and an audit trail
that cannot explain its own numbers is not an audit trail.

## Deliberately excluded

- **The discounts engine** (codes, percentage/fixed-amount promotions) — P5b, under phase issue
  **#88**. `Order.discountPence` is shaped so P5b is additive.
- **Reversing an `EARN`.** Worth stating precisely because it looks like an omission: `releaseOrder`
  only cancels orders in `PENDING_PAYMENT`, which is strictly *before* `confirmPayment` writes an
  earn, so **no code path in this codebase can currently cancel an order that has earned points**.
  The reachable reversal is of a `REDEEM` — points held by a checkout that Stripe then failed or
  expired — and that is what this slice implements. Tracked as **#137**, which also records that
  the `@@unique([orderId, kind])` index is the real design question there, not the arithmetic.
  Earn reversal becomes reachable when staff
  cancellation and refunds land, which is ADR-005 territory and out of scope here.
- **Creating and deleting tier rows** from the admin UI (**#136**). Tier definitions are seeded;
  their numbers are editable. Full tier CRUD is deferred rather than half-built, and P6's admin
  panel may supersede it wholesale.
- **Guest loyalty.** A balance needs an identity, and P3a's `guestToken` deliberately identifies a
  cart, not a person. A guest checkout ignores any redemption input.
- **Cross-vendor balances.** Decided at `/propose`: points carry `vendorId` like every other row,
  consistent with ADR-004. A platform-wide balance would have SriMart honouring points earned at
  Aheed while ADR-005 already records that inter-vendor settlement is off-platform and unmodelled.
- **Any new email.** No loyalty email is added and P4b's transition emails are untouched; the
  confirmation email's discount line above is a consistency fix to an existing message, not a new
  one.
- **Points-earned messaging on the order confirmation and history pages** (**#138**). Those pages
  render the money breakdown and the new discount line, but not "you earned N points" — the earn is
  written by the webhook after the confirmation page first renders, so which tense is true depends
  on a product decision.

## Open items carried forward

- **#104** — Resend still has no verified sending domain. Unchanged by this slice, which sends no
  email, but it remains the reason no email assertion here is end-to-end.
- **#113** — production runs Stripe test-mode keys. The `MIN_PAYABLE_PENCE` floor is chosen against
  Stripe's GBP minimum and applies identically in either mode.
- **Slice size.** Core + tiers + expiry + admin UI in one slice was an explicit decision at
  `/propose` (#135). This is the largest slice since P3b; if validation proves unwieldy, the split
  to make is admin-config-and-tiers into a P5a2, since the earn/redeem/expiry core is what everything
  else depends on.
