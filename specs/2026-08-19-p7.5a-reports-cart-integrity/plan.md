---
id: p7-5a-reports-cart-integrity-plan
title: "P7.5a — Staff reports correctness & checkout cart preservation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-19
visibility: internal
summary: Filters cancelled and unpaid orders out of the staff revenue aggregate, stops the admin panel being edge-cached, and restores the shopper's cart when the payment provider is unreachable — the three places this system currently states something untrue.
tags: [p7.5, reports, revenue, cache, checkout, cart, defect]
related: [roadmap, p3c-stripe-payments, p6a-admin-shell-orders]
---

# P7.5a — Staff reports correctness & checkout cart preservation (plan)

**Goal:** close the three defects where this system **asserts something false to the person acting
on it** — a revenue figure 39% too high, a page that serves a stale copy of that figure, and a
checkout error that tells a shopper to retry a purchase whose basket it has already destroyed.
First slice of P7.5 (epic **#260**); closes **#238**, **#237**, **#234**.

## Why these three are one slice

They are not the same code. They are the same *failure class*, and it is the one class that should
not survive into P8: everything else on P7.5's list is a feature that is missing, whereas these
three are features that are present and lying. #237 and #238 are additionally the same page — fixing
either alone still leaves a wrong number on an owner's screen.

## Scope (this slice)

### 1. Revenue excludes orders that were never paid for (#238)

`lib/repositories/orders.ts`'s `getFinancialsForStaff` aggregates `Order` on `vendorId` alone, with
no status filter. `PENDING_PAYMENT` orders (abandoned checkouts) and `CANCELLED` orders therefore
count as revenue. Measured on staging 2026-08-18: **39% overstated**. `/staff/reports` derives Avg
Basket Value from these two numbers, so all three tiles are wrong from one cause.

**The revenue status set, stated rather than inferred:** `CONFIRMED`, `OUT_FOR_DELIVERY`,
`DELIVERED`. These are exactly the statuses reachable only *after* `confirmPayment` — money has
changed hands and has not been given back. `PENDING_PAYMENT` is money that never arrived;
`CANCELLED` is an order whose stock was returned by `releaseOrder`.

Note this set is **not** the inverse of `STAFF_QUEUE_STATUSES` and must not be derived from it: that
constant is a *worklist* (what staff can act on) and deliberately omits `DELIVERED`, which is
precisely the status most certain to be real revenue.

It lands as `REVENUE_STATUSES` in **`lib/order-status.ts`**, beside `ORDER_STATUSES` and
`STAFF_QUEUE_STATUSES`. That module's defining property is that it does no I/O and imports no Prisma
client, so the rule is unit-testable with no database — the same reason `STAFF_QUEUE_STATUSES` was
moved there in P6a.

### 2. The admin panel stops being edge-cached (#237)

`/staff/reports` is `export const dynamic = "force-dynamic"`, so Next is not the cache. Measured on
staging seconds apart in one signed-in session: `£2,982.02 / 109` versus `?cachebust=` →
`£3,003.49 / 110`, with the database agreeing with the **uncached** figure. Something in front of
the Worker is caching HTML.

Verified in the current tree: `next.config.mjs`'s `headers()` sets security headers on `/:path*` and
**no `Cache-Control` at all**; the only `no-store` anywhere in the app is
`app/(storefront)/account/data/export/route.ts`. So the panel emits no cache directive and an
intermediary is free to invent one.

**Fix:** emit `Cache-Control: private, no-store` for `/staff/:path*` from `next.config.mjs`'s
`headers()`, reusing the pattern the data-export route already establishes.

**Scoped to the whole panel, not just `/staff/reports`, deliberately.** Every `/staff/*` page is
per-vendor, role-gated, mutable operational data; `/staff/orders` serving a cached packing queue is
the same defect with worse consequences. Fixing the instance and leaving the class would guarantee a
second issue.

### 3. A failed payment no longer destroys the basket (#234)

`placeOrder` clears the cart **inside** the order-creating transaction — deliberately, and the
comment says why: clearing last, inside the transaction, is what makes a double submit safe (the
second finds `CART_EMPTY`). After that transaction commits it calls `payments.createPayment`. When
that throws, the `catch` calls `releaseOrder` (cancels the order, returns stock, reverses points and
the discount-code use) and throws `CheckoutError("PAYMENT_PROVIDER_FAILED", ...)` whose message
tells the shopper nothing has been charged and to try again.

Everything in that compensation is restored **except the cart**. The shopper is told to try again
and handed an empty basket. Observed on staging with a 17-item cart.

**Fix:** in `placeOrder`'s `catch`, after `releaseOrder` succeeds, re-insert `CartItem` rows for
`input.cartId` from the cancelled order's `OrderItem` rows (`productId`, `quantity`). The `Cart` row
itself is untouched by checkout — only its items are deleted — so the cart the shopper's cookie or
session already points at comes back populated, with no new cart and no client change.

**Why the restore lives in `placeOrder`'s catch and not inside `releaseOrder`:** `releaseOrder` is
shared with the Stripe webhook path, which cancels orders whose Checkout session **expired** — often
hours later, with the shopper long gone and possibly a new cart already built. Resurrecting a basket
there would be a surprise, not a repair. Only `placeOrder`'s synchronous failure has a shopper
waiting on the response, and only it has `input.cartId` in scope.

**Idempotency:** `CartItem` carries `@@unique([cartId, productId])`. The restore must not throw if a
row for that product already exists.

### 4. Documentation carried by this slice (not code)

- **`specs/decisions/ADR-005-payments-money-flow.md` gains a P7.5a implementation note.** Its P3c
  note currently describes the compensation as "stock decremented at creation is **released** on
  payment failure or session expiry" — after this slice that understates what the path does. The
  note must also record *why* the cart restore is confined to `placeOrder`'s `catch`, because the
  obvious-looking tidy-up (moving it inside `releaseOrder`, where the rest of the compensation
  lives) is precisely the change that would resurrect a stale basket hours later on the webhook
  path. A code comment alone would not reach someone reading the ADR to decide how compensation
  works.
- Insert **P7.5** into `specs/roadmap.md`'s Phases list — the phase was approved at Propose and the
  roadmap does not yet mention it.
- Add the roadmap change-log **carry-forward row for PR #259** (merge `c532bb0`, P7d's `/document`
  closeout promotion), which `npm run sdd:audit` currently reports as pending. Same #144 pattern: a
  `/document` closeout PR cannot cite its own promotion.

## Deliberately excluded

- **A status breakdown on `/staff/reports`.** #238's issue body shows a per-status table; that is
  evidence for the bug, not a requested feature. This slice makes the three existing tiles correct
  and adds no tile. Reports expansion is **P7.5d** (#264), sequenced after this slice for exactly
  this reason.
- **Refunds.** A refunded order would need to leave the revenue set, but no refund path exists —
  ADR-005 records refunds as its own undecided territory. `REVENUE_STATUSES` will need revisiting
  when it lands; that is noted in the constant's comment, not built here. Related: **#137**, **#151**.
- **Resuming a failed payment.** Restoring the cart lets the shopper retry checkout from the cart.
  Resuming the *existing* `PENDING_PAYMENT` order is **#100**, deferred to P8 — it carries a
  double-charge question this slice does not touch.
- **Cart restoration on webhook-driven cancellation.** Reasoned above; the webhook path is
  unchanged.
- **Any change to when the cart is cleared.** The in-transaction clear is load-bearing for
  double-submit safety. This slice compensates, it does not restructure.

## Open items carried forward

- **A zone-level Cloudflare Cache Rule could override the origin header.** Cloudflare respects
  `private, no-store` by default, but a rule set to "Eligible for cache" with an Edge TTL that
  ignores origin cache-control would defeat R7/R8 from the dashboard, outside this repo. If
  validation shows the header present and `cf-cache-status` still reporting a hit, that is the
  cause, and the remaining fix is an owner action in the Cloudflare dashboard — to be filed as its
  own issue rather than worked around in code. Flagged now so a fresh-context validator recognises
  it instead of re-deriving it.
