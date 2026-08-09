---
id: p3b-checkout-order-core
title: "P3b — Checkout + order core (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-10
visibility: internal
summary: Turn a cart into a real order. Vendor-scoped Address/Order/OrderItem/Payment/OrderStatusEvent, totals from VendorConfig delivery rules, and atomic order creation that decrements stock with a conditional guard so overselling is structurally impossible. Payment is stubbed behind a port; Stripe is P3c.
tags: [p3, checkout, orders, payments, multi-tenancy]
related: [roadmap, architecture, adr-004-multi-tenancy, adr-005-payments-money-flow, p3a-cart-foundation, tech-stack]
---

# P3b — Checkout + order core (plan)

Second slice of **P3 — Cart & checkout** (issue #96, epic #86), following P3a (#93). P3a made the
cart real; this turns a cart into an **order**. `requirements.md` holds the checkable criteria.

**Goal:** a shopper — guest or signed-in — can check out and get a real, persisted order with
correct money, and **stock cannot be oversold**. Payment is stubbed behind a port so the riskiest
logic (atomic creation + decrement) is fully testable **before** any Stripe credential exists.

## The core problem: no overselling, without raw SQL

`CLAUDE.md` forbids raw SQL in application code, so the decrement is a **conditional
`updateMany`** inside an interactive transaction:

```ts
const { count } = await tx.inventory.updateMany({
  where: { productId, vendorId, quantity: { gte: qty } },   // the guard
  data:  { quantity: { decrement: qty } },
});
if (count === 0) throw new InsufficientStockError(productId);  // → whole tx rolls back
```

Postgres evaluates that `WHERE` and applies the write atomically per row, so two concurrent
checkouts for the last item cannot both succeed — `count === 0` is the signal, with no
read-then-check gap. **Rejected:** read-then-write (racy), and `SERIALIZABLE` isolation (heavier,
and retry-on-serialization-failure is a worse failure mode than an explicit stock error).

**Stock decrements at order creation** (owner decision), not at payment success — overselling
becomes structurally impossible. The accepted cost is that an abandoned checkout holds stock until
released, and **that release is P3c** (Stripe `payment_failed` / `checkout.session.expired`). It is
called out here so it cannot be quietly forgotten.

## Two modelling problems the existing sketch doesn't solve

Both surfaced while writing this spec, and both change a standing decision:

- **`OrderStatus` has no pre-payment state.** `specs/architecture.md` §3.2 sketches
  `OrderStatus { CONFIRMED OUT_FOR_DELIVERY DELIVERED CANCELLED }` with `@default(CONFIRMED)`. With
  pay-then-confirm that is wrong: an unpaid order sitting as `CONFIRMED` would be picked and
  delivered by staff. The enum gains **`PENDING_PAYMENT`** as the initial state; P3c's webhook moves
  it to `CONFIRMED`. `architecture.md` is updated to match — it is the standing decision, not this
  folder. **Migration note:** the enum exists only in that sketch, never in `prisma/schema.prisma`,
  so this is a fresh `CREATE TYPE` — *not* an `ALTER TYPE ... ADD VALUE`, which would have risked
  Postgres's "unsafe use of new value" error when the new value is used in the same migration.
- **An order's address must not mutate later.** `architecture.md` §3.1 already commits to
  "historical snapshots are intentional" (`OrderItem` snapshots name + unit price). The delivery
  address needs the same treatment, or editing a saved address later would silently rewrite the
  address a past order was delivered to. So **`Address` is a per-order snapshot row** that `Order`
  points at, with a **nullable `userId`** so a future address book can reuse the table with no
  migration.

## Key design decisions

- **Everything is `vendorId`-scoped** (ADR-004 decision 2, which names `Order` explicitly), behind a
  new `lib/repositories/orders.ts` — the no-direct-Prisma guard stays green.
- **Order numbers are vendor-prefixed, dated, and random** —
  `{VENDOR}-{YYYYMMDD}-{6 chars}` (e.g. `AHE-20260810-K4M2XQ`). Deliberately **not a sequential
  counter**: sequential numbers leak order volume to anyone who places two orders. Uniqueness is
  enforced by a unique index with a bounded retry on collision, not by trusting randomness.
- **The whole checkout is one transaction:** decrement stock → create `Address`/`Order`/`OrderItem`s
  /`Payment`/`OrderStatusEvent` → **clear the cart**. Clearing inside the transaction gives
  **double-submit protection for free**: a second submit finds an empty cart and fails cleanly
  instead of creating a duplicate order.
- **Five gates before an order exists**, each a distinct, testable failure: merge decision resolved
  (inherited from P3a), cart non-empty, every line still available, postcode deliverable for this
  vendor, subtotal ≥ `minimumOrderPence`.
- **Money is recomputed server-side from the DB at creation time** — never taken from the form or
  from what the cart page rendered. Prices are then snapshotted into `OrderItem`.
- **`PaymentService` port** mirroring `EmailService`/`StorageService`'s shape (`tech-stack.md` names
  this port; it has never existed). The P3b adapter is a **stub** returning `PENDING` with a
  placeholder reference; P3c swaps in Stripe behind the same interface.

## Scope (this slice)

- Prisma: `Address`, `Order`, `OrderItem`, `Payment`, `OrderStatusEvent`; `PENDING_PAYMENT` added to
  `OrderStatus`; `PaymentStatus` enum. Additive migration.
- `lib/payments.ts`: `PaymentService` port + stub adapter.
- `lib/order-totals.ts`: pure totals (subtotal / delivery fee / total) from vendor delivery rules.
- `lib/repositories/orders.ts`: the transactional `createOrder` plus order lookup by number.
- `features/checkout/`: the checkout server action and its validation.
- UI: checkout page following `docs/ui-ref/CheckoutModal.tsx`'s structure (contact / address /
  summary), and an on-screen order confirmation.
- **`specs/decisions/ADR-005-payments-money-flow.md`** — single platform Stripe account with a
  Connect-ready seam, and the **merchant-of-record** posture that implies (a legal position
  currently recorded nowhere).
- Docs: `architecture.md` (enum + order model + snapshot rule), `tech-stack.md` (port now real),
  `CHANGELOG.md`.

## Deliberately excluded

- **Stripe, webhooks, emailed confirmation, and stock release on payment failure/expiry** — **P3c**.
- **Delivery slots / capacity** — **P4** (owner decision). The reference has a slot picker, but
  slots without capacity limits would let 40 deliveries sell into one 2-hour window.
- **Cash on Delivery** — out of scope (owner decision); it is a second order lifecycle plus cash
  reconciliation, and deserves its own proposal.
- **Order history, status transitions, staff updates** — **P4**.
- **Discounts / loyalty** — **P5**. `Order` deliberately gets **no** `discountTotal` /
  `loyaltyRedeemed` columns yet, despite `architecture.md`'s sketch showing them: building unused
  columns is speculative, and P5 can add them in its own additive migration.
- **A saved-address book and its picker UI** — the `Address` table is shaped to allow it (nullable
  `userId`), but nothing reads addresses back in this slice.
- **"Shop your list"** — **P3d**.

## Open items carried forward

- **Stock held by abandoned checkouts has no release path until P3c.** Until then an order stuck in
  `PENDING_PAYMENT` holds its stock indefinitely. Acceptable because P3b's stub payment is not
  reachable by real customers, but it must not ship to production ahead of P3c.
- **Staging's `VendorConfig` delivery columns are still `NULL`** (added by P3a's migration; values
  come from seed). Totals can't be verified end-to-end on staging until a re-seed runs.
- **A guest's order confirmation is a capability URL.** With no account, the order number is the
  only credential, so `/checkout/{orderNumber}` is guessable-in-principle — the random segment is
  what makes it not so in practice, and the page exposes nothing beyond that one order. A stronger
  guest-access mechanism (emailed magic link, or lookup by email + number) is **P4**; recorded here
  rather than silently accepted.
- **The transactional core deliberately takes `prisma` and `vendorId` as arguments** rather than
  resolving them from request context. That is a testability requirement, not a style choice: the
  concurrency guarantee is the single most important property of this slice, and it cannot be
  tested at all if the only entry point needs a live request.
