---
id: adr-005-payments-money-flow
title: "ADR-005 — Payments & multi-vendor money flow"
audience: [dev]
type: adr
status: approved
version: "1.6.0"
updated: 2026-08-29
visibility: internal
summary: Stripe behind a PaymentService port, taking card payments via hosted Stripe Checkout. All vendors settle into a single platform Stripe account for now, with a Connect-ready seam so per-vendor payouts are an additive change rather than a rewrite.
tags: [adr, payments, stripe, multi-tenancy, compliance]
related: [architecture, tech-stack, adr-004-multi-tenancy, p3b-checkout-order-core]
---

# ADR-005 — Payments & multi-vendor money flow

- **Status:** **Accepted** (approved 2026-08-10). Decided during P3's proposal; recorded here because
  the choice sets a **legal posture**, not just a technical one, and was previously written down
  nowhere. Tracked by issue #96 (P3b).
- **Related:** `specs/tech-stack.md` (names the `PaymentService` port), ADR-004 (multi-tenancy),
  `specs/architecture.md`.

## Context

ADR-004 made the platform multi-tenant: two vendors (Aheed Food Centre and SriMart) already serve
different catalogues on different hosts from one codebase. P3 introduces payment. That raises a
question ADR-004 never addressed: **when a customer pays SriMart, whose bank account does the money
land in?**

`tech-stack.md` already committed to Stripe behind a `PaymentService` port with PCI scope minimised,
but said nothing about routing money between vendors, and the port itself had never been written.

## Decision

1. **Stripe, behind the `PaymentService` port** (`lib/payments.ts`). Card data never touches our
   servers in any implementation. The port exists so the provider is swappable and so P3b could ship
   and be tested with a **stub adapter** before any Stripe credential existed.

2. **Hosted Stripe Checkout, not embedded Elements.** Stripe hosts the payment page; we create a
   session server-side and confirm via a signature-verified, idempotent webhook. Rationale: Checkout
   handles **UK Strong Customer Authentication / 3-D Secure**, which is a legal requirement rather
   than a nicety, and brings Apple/Google Pay with the smallest PCI surface and least Worker code.
   **Rejected:** Payment Intents + Elements — better brand continuity (which matters more now that
   branding is per-vendor), but we would own the 3DS action flow and its failure modes. It remains a
   later swap behind this same port.

3. **A single platform Stripe account, with a Connect-ready seam.** Every vendor's payments settle
   into one Stripe account today. `CreatePaymentInput` carries `vendorId` so an adapter can route
   per vendor, and a `VendorPaymentAccount` table can be added later without reshaping the port.
   **Rejected:** full Stripe Connect now — the correct long-term marketplace model, but it needs
   Connect onboarding, KYC, payouts and per-account webhooks, and SriMart is a seeded demo vendor,
   not a real merchant. **Also rejected:** no seam at all — that would repeat exactly the
   hardcoded-single-vendor retrofit ADR-004 spent five slices undoing.

4. **Stock is decremented at order creation, not at payment success.** The order is created
   `PENDING_PAYMENT` with stock already held, so overselling is structurally impossible. Releasing
   stock when payment fails or the Checkout session expires is handled by P3c's webhook.

## Consequences

- **Positive:** one integration serves all vendors; PCI scope stays with Stripe; SCA is handled for
  us; adding a real second merchant is additive.
- **⚠️ Merchant of record.** With a single platform account, **the platform is the merchant of
  record for every vendor's sales** — SriMart's customers pay the platform, and the platform owes
  SriMart. That carries real obligations: settlement to vendors happens **off-platform** and is not
  modelled anywhere in this system; refunds and chargebacks land on the platform's account; and the
  platform's own terms, tax treatment and consumer-rights position must reflect that it is selling,
  not merely introducing. **This is acceptable only while the sole real merchant is Aheed itself.**
  Before onboarding a genuine third-party merchant, revisit this decision — the trigger is
  commercial, not technical, so it will not surface as a failing test.
- **Cost:** an abandoned checkout holds stock until P3c's release path exists. P3b must not reach
  production ahead of P3c.
- **Rule of thumb:** if taking payment for a new vendor requires anything beyond database rows and
  Stripe configuration, the seam has been violated.

## Implementation note (P3c, 2026-08-10, #99)

All four decisions above are **implemented**: `lib/payments.ts` creates hosted Checkout sessions via
raw `fetch` against the single platform account, carrying `vendorId` through `CreatePaymentInput` as
the Connect-ready seam; `/api/webhooks/stripe` verifies signatures with WebCrypto and confirms or
cancels orders idempotently; stock decremented at creation is **released** on payment failure or
session expiry, closing the gap P3b recorded. The stub adapter is kept as the fallback for
environments with no Stripe key.

One thing worth recording because it is easy to get wrong: **exactly one webhook endpoint is
registered per environment, not one per vendor host.** The same Worker serves every host and the
handler derives the vendor from the order, so per-host endpoints would only produce multiple signing
secrets that the single `STRIPE_WEBHOOK_SECRET` cannot represent.

## Implementation note (P5a, 2026-08-11, #135)

Loyalty redemption reduces what the customer pays, so it is worth recording where it sits relative
to the decisions above: **entirely upstream of them**. The discount is applied inside
`computeTotals` during the checkout transaction, so `Order.totalPence` is already net of it before
`createPayment` is called after the commit. The `PaymentService` port, the hosted-Checkout flow and
the webhook are all unchanged — a redemption is invisible to them, because by the time they see an
amount it is simply the amount.

**No decision here is reopened.** This is a note about ordering, not a change to any of the four.

One constant this does introduce, and the reason it belongs in this ADR rather than only in the
slice spec: **`MIN_PAYABLE_PENCE` (30p)** in `lib/loyalty.ts`. Decision 2 committed to hosted Stripe
Checkout, and Stripe will not create a GBP session below 30p. Without a floor, a large enough
redemption would produce an order that commits successfully and can then never be paid for —
`createPayment` would fail and the compensating path would immediately cancel the order the shopper
just placed. The clamp makes that unreachable rather than rare. A payment provider with a different
minimum, or a decision to allow fully-points-paid orders (which needs a no-payment path this
codebase does not have), would both change that number — so it lives next to the redemption rules,
not in the payment adapter.

## Implementation note (P5b, 2026-08-11, #145)

Discount codes join loyalty redemption in exactly the same position relative to the decisions above:
**entirely upstream of them.** A code is claimed inside the checkout transaction and its pence figure
is passed to the same `computeTotals` call, so `Order.totalPence` is already net of it before
`createPayment` runs after the commit. The `PaymentService` port, the hosted-Checkout flow and the
webhook are unchanged and did not need reading — by the time they see an amount it is simply the
amount. `MIN_PAYABLE_PENCE` is reused, not redefined: a code is clamped by the same 30p floor, and
the combined code-plus-points discount obeys it jointly, so no combination of the two can produce an
order that commits and can never be paid for.

**No decision here is reopened.** As with P5a, this is a note about ordering.

One consequence worth recording for a future refund path: a *paid* order's code use cannot currently
be returned, because `releaseOrder` acts only on `PENDING_PAYMENT` orders. That is the same
structural reason #137 gives for earn reversal, and it is tracked as #151 rather than solved here —
refunds are this ADR's territory, and the decision belongs with them.

## Implementation note (P7.5a, 2026-08-19, #234)

**The payment-failure compensation restores the shopper's cart as well as the stock.** P3c's note
above describes that path as releasing stock; that was the whole of it, and it was incomplete in a
way that only showed up in front of a real shopper. `placeOrder` clears the cart *inside* the
order-creating transaction — deliberately, because that is what makes a double submit safe (the
second attempt finds `CART_EMPTY`) — so when `createPayment` then throws, the order is cancelled and
its stock, points and discount-code use are all returned, while the basket stays deleted. The error
copy tells the shopper "Nothing has been charged — please try again", and trying again was
impossible: they landed on an empty cart and had to rebuild it item by item. Observed on staging
with a 17-item basket during #103's deliberate payment-failure window.

`restoreCartFromOrder` now re-inserts the cancelled order's lines into the originating cart.

**Two constraints on that function that are easy to undo by tidying it up:**

1. **It is called from `placeOrder`'s `catch`, not from inside `releaseOrder`,** even though the
   rest of the compensation lives there and moving it would look like obvious consolidation.
   `releaseOrder` is shared with the Stripe webhook, which cancels orders whose Checkout session
   *expired* — typically hours later, with the shopper long gone and possibly a new basket already
   built. Restoring a cart there resurrects a stale basket rather than repairing anything.
2. **It runs only when `releaseOrder` actually cancelled the order** (`count === 1`). A `false`
   return means the order was already `CONFIRMED` or already `CANCELLED` by someone else; refilling
   the cart for an order that turned out to be *paid* would hand the shopper a duplicate basket,
   which is a worse failure than the empty one this fixes.

Nothing here reopens a decision — the money flow is unchanged. It records what the compensation path
now does, so a future reader does not infer from the P3c note that stock is all it covers.

## Implementation note (P7.5b, 2026-08-20, #150 / #138)

**An order's `discountPence` is now decomposed for display, and the loyalty share is obtained by
subtraction — deliberately, not for want of a better source.**

`Order.discountPence` is a single generic column by design (see the P5a note above): it holds a
loyalty redemption, a discount code, or both added together, and `placeOrder` is its only writer
(`codeDiscountPence + redemption.discountPence`). Only the code's share is separately stored, as
`DiscountRedemption.amountPence`. So:

- **code share** = `DiscountRedemption.amountPence`
- **loyalty share** = `discountPence − code share`

The obvious-looking alternative — recovering the loyalty share from the REDEEM ledger row via
`pointsToPence(points, pencePerPointRedeemed)` — is **wrong, and must not be "fixed" back to it**.
The ledger stores a redemption in *points*, not pence, and `pencePerPointRedeemed` is vendor config
an admin can change at any time afterwards. A recomputed share would therefore drift away from the
`discountPence` displayed beside it, and an order page would stop adding up. Subtraction cannot
drift: the two shares sum to the figure they decompose, by construction.

Two bounds make that safe rather than merely convenient, and both are enforced upstream: a code's
face value is clamped before it is stored (`lib/discounts.ts:141`), and `clampRedemption` gives
points only the headroom the code left. So the code share can never exceed `discountPence`, and
`splitDiscount` needs no defensive cap — one is deliberately absent so that a genuine data defect
would surface rather than be silently absorbed.

**Points earned are read, never predicted.** `earnPoints` writes its EARN row inside
`confirmPayment`'s transaction, so `pointsEarned` is non-null exactly when the award has happened.
Surfaces that render an order before payment clears show a line with no number rather than an
estimate — the tier multiplier comes from a windowed spend query and is snapshotted onto the EARN
row *because* it moves, so an estimate computed outside that write path can legitimately disagree
with the award. The confirmation email is unaffected either way: it is sent only after the webhook's
`confirm` returned true, from a second, post-commit read of the order.

Nothing here changes how money is calculated, charged or recorded — only what an order is able to
explain about the figures it already carries.

## Implementation note (P9.1, 2026-08-29, #429)

**A verified webhook signature is no longer sufficient to move an order's payment state.** The
Decision's "signature-verified, idempotent webhook" is unchanged and no decision here is reopened —
this records a third property it now also has, and which the wording above does not imply.

A signature proves an event came from Stripe. It does not prove the event concerns *the payment this
order is waiting on*: a session created in the same Stripe account with crafted metadata, or a
metadata mix-up during an integration change, both arrive correctly signed. Until this slice
`metadata.orderNumber` was the only link between an event and the order it moved, and
`Payment.providerReference` — written post-commit with the Checkout Session id — was never read back.

Both transitions now also prove correspondence, in the `where` clause of the compare-and-set that
already guarded the status change, never by fetching and comparing in application code. That
placement is the point: it is the P7a lesson recorded on `findOrderForGuestLookup`, where a missing
credential *skipped* the comparison instead of failing it. It also makes the nullable-reference case
free — a stored `null` cannot equal a non-null session id, so an order whose session write never
landed is refused by the same predicate that refuses a wrong one, with no separate branch.

The two paths bind on deliberately different fields:

| | binds on | rationale |
|---|---|---|
| `confirmPayment` | provider, session id, amount, currency | confirmation is where money is asserted, so the money is checked |
| `failPayment` | provider, session id | cancellation asserts no money; refusing to release stock because Stripe omitted `amount_total` would strand inventory indefinitely — a worse failure, reachable with no attacker |

**Money is still calculated, charged and recorded exactly as before.** `computeTotals` remains the
only place an order's money is decided, and `lib/payments.ts` is untouched. What changed is which
events are permitted to act on a figure that was already correct.

**Two consequential details for future readers.** First, a mismatch **fails closed**: the order stays
`PENDING_PAYMENT` and the refusal is logged, which means a genuine integration defect would leave a
real shopper charged with no confirmation and their stock held, needing manual reconciliation —
tracked as **#454**, since #101 covers webhooks that never *arrive*, not ones that arrive and are
refused. Second, the P7.5b note above says the confirmation email is sent "after the webhook's
`confirm` returned true"; `confirmPayment` now returns a result union rather than a boolean, and the
email is keyed on `{ ok: true }`. The behaviour is the same — the wording predates the type.

## Deferred upgrade — Stripe Connect

When a real third-party merchant onboards: add `VendorPaymentAccount` (vendor → Stripe account id),
onboard vendors through Connect, and have the adapter set the destination/`on_behalf_of` per vendor.
Additive to the port defined here — not a rewrite. Platform fees, payout schedules and per-account
webhook routing come with it.
