---
id: p4b-order-status-transitions
title: "P4b — Staff order status transitions & delivery emails (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-11
visibility: internal
summary: The write half of P4 — a vendor-role-gated staff queue that advances orders along CONFIRMED → OUT_FOR_DELIVERY → DELIVERED, writing an attributed OrderStatusEvent per step and emailing the customer, closing the phase.
tags: [p4, orders, staff, rbac, email, transitions]
# related: [p4a-order-history, p3b-checkout-order-core, p3c-stripe-payments, adr-004-multi-tenancy]
---

# P4b — Staff order status transitions & delivery emails (plan)

**Goal:** make order status *move*. Today an order reaches `CONFIRMED` when Stripe's webhook fires
and then never changes again — `OUT_FOR_DELIVERY` and `DELIVERED` have existed in the `OrderStatus`
enum since P3b's initial migration and **nothing in the codebase can reach them**. P4a made status
visible to the customer; this makes it advance, under a real person's hand, with that person on the
record. Shipping it closes P4 (epic #87).

## Scope (this slice)

**1. Transition legality, pure and unit-tested — `lib/order-status.ts`.**
The module already carries P4a's presentation helpers and its own header comment says "P4b extends
this module with transition legality." It gains `canTransition(from, to)` and `nextStatus(from)`
over a `LEGAL_TRANSITIONS` map, and keeps its defining property: **no I/O, no `@prisma/client`
import**, so the rules are testable with no database — the same split as `lib/cart-rules.ts`,
`lib/auth-origin.ts`, `lib/delivery.ts` and `lib/shopping-list.ts`.

The ladder is strictly forward and strictly single-step:

| From | Legal next |
|---|---|
| `PENDING_PAYMENT` | *(none — only Stripe's webhook confirms or cancels)* |
| `CONFIRMED` | `OUT_FOR_DELIVERY` |
| `OUT_FOR_DELIVERY` | `DELIVERED` |
| `DELIVERED` | *(terminal)* |
| `CANCELLED` | *(terminal)* |

An unpaid order cannot jump to delivered; `CONFIRMED → DELIVERED` cannot skip a rung; nothing moves
backwards; an unrecognised status permits nothing. Staff **cannot** cancel — that is refund-adjacent
and explicitly out of scope (below).

**2. `advanceOrderStatus(prisma, vendorId, orderNumber, toStatus, actor)` — `lib/repositories/orders.ts`.**
Every dependency is an explicit argument. This is the shape `placeOrder(prisma, vendorId, input)` and
`getWebhookOrderService()` both had to be **refactored into at validation time**, because their
earlier versions resolved `prisma`/`vendorId` internally and so could not be exercised from a plain
script. Designing for that up front is cheaper than being caught by it a third time.

It returns a discriminated result rather than throwing — `{ ok: true; order: WebhookOrder }` or
`{ ok: false; reason: "not-found" | "illegal-transition" }` — mirroring `requireRole()` and
`requireVendorRole()`'s established returned-as-data posture in `lib/auth-rbac.ts`.

Two properties are structural, not checked-then-hoped:

- **Legality is evaluated against the *persisted* status, never a client-supplied "from".** The
  update is a conditional `updateMany({ where: { id, vendorId, status: <observed from> } })` — a
  compare-and-set. If a second submit (a double-click, a stale tab, two staff members at once) lands
  after the first committed, the `where` matches zero rows and the call returns `illegal-transition`
  having written nothing. This is exactly P3b's conditional-`updateMany` stock decrement applied to a
  different race, and it is why the guarantee is "cannot double-advance" rather than "unlikely to".
- **`vendorId` is in the `where`, not a post-hoc comparison.** SriMart staff calling with an Aheed
  order number get `not-found`, indistinguishable from a number that does not exist — ADR-004's
  row-level rule, and the same shape P4a's `getForUser()` used for ownership.

The success payload is a `WebhookOrder`, the type P3c already defined and `sendOrderConfirmationEmail`
already consumes. It carries `buyerEmail` (resolved `guestEmail ?? user.email ?? null`), the items and
the money — so the status email reuses that type instead of a parallel one.

**3. The actor becomes a column — one additive migration.**
`OrderStatusEvent` gains `createdByUserId String?` with a `User?` relation, `ON DELETE SET NULL`
(a departed staff member's account being removed must not cascade-delete the audit trail). Nullable,
so every existing row written by P3b and P3c stays valid with no backfill; system transitions
continue to leave it `null` and staff transitions set it from `requireVendorRole().user.id`.

This **corrects issue #125's original "no schema change, no migration" line**, which was an
Orient-time observation that the enum and event model already existed rather than a decision. It
could not survive contact with "the acting user recorded": `OrderStatusEvent` was `orderId, vendorId,
status, note, createdAt` and nothing else. P4's roadmap line promises "three-step status with **audit
trail**, staff updates" — an audit trail that cannot say who acted is not one, and attribution not
captured now is unbackfillable, because the data would simply never have existed.

*Rejected: write the actor into `note`.* Zero migration, but it makes one column carry prose and
audit data at once — unqueryable, unfilterable, a staff email baked into free text with no way to
redact, and P6's "changed by" becomes prose-parsing.

**4. The staff queue — `app/(storefront)/staff/orders/page.tsx`.**
A new `/staff` segment parallel to `/dev`, inside the `(storefront)` route group so it inherits
per-request vendor resolution, branding and layout. Gated by
`requireVendorRole("STAFF", "ADMIN")` — **the first real consumer of ADR-004 slice 3a's
`VendorMembership`**, which until now had no caller exercising it in anger. It follows `/dev`'s
established shape exactly: `export const dynamic = "force-dynamic"`, 401 → `redirect("/login")`,
403 → a rendered "staff only" message rather than a leak or a crash.

The table shows this vendor's **actionable** orders only — `CONFIRMED` and `OUT_FOR_DELIVERY` —
newest first, served by the `@@index([vendorId, status, createdAt])` that P3b already put on `Order`.
Each row carries the order number, placed date, item count, a three-item preview, the total, the
current status badge, and one button labelled by the single legal next step.

It is **keyset-paginated on `(createdAt, id)`**, mirroring P4a's `listForUser` rather than inventing
a second list shape, and mirroring `specs/architecture.md`'s standing "never `OFFSET`" rule. A fixed
`take` with no next-page link would have been simpler, but a worklist that silently stops at row *N*
is worse than a slow one: the order nobody can see is the order nobody packs.

*This is a deliberate inversion of P4a's rule, and the difference is the audience.* P4a's customer
list is **unfiltered** because a shopper hunting a failed payment most needs the `PENDING_PAYMENT`
row nobody wants to show them. A staff queue is a **worklist**: `PENDING_PAYMENT` is Stripe's to
resolve and no staff action can touch it, and `DELIVERED`/`CANCELLED` are finished. Showing them
would pad the page with rows whose only control is disabled. Full history for staff is P6's
dashboard.

**5. The advance action — `features/orders/advance-status.ts`.**
A server action is a **public endpoint**, not a private continuation of the page that rendered it.
It therefore re-runs `requireVendorRole("STAFF", "ADMIN")` itself; the page's gate protects the
page, nothing more. `orderNumber` and `toStatus` arrive as untrusted `FormData` — `toStatus` is
validated against the known status set and then, in the repository, against the persisted status, so
a forged payload fails the same way a stale one does.

**6. `note` stays system-written — staff get no free-text field.**
Each staff transition writes an `OrderStatusEvent.note` generated from the target status, exactly as
P3b's "Order placed; awaiting payment." and P3c's "Payment confirmed." already do. **P4b ships no
input through which a staff member can type into that column.** Issue #125 framed this slice as "the
one that hands staff a control that writes that column", which is what motivated P4a's guard — and
the cheapest way to honour that guard is to not open the door yet. A staff-authored note is a real
feature (it needs a customer-visible/internal distinction, and P4a's timeline is deliberately
incapable of rendering either), and it belongs with P6's dashboard, not bolted onto an advance button.

**7. Two customer emails — `features/orders/send-status-email.ts`.**
Sent on `OUT_FOR_DELIVERY` and on `DELIVERED`, and on nothing else — `CONFIRMED` already has P3c's
confirmation email and must not be sent twice. Copies `features/checkout/send-confirmation.ts`
verbatim in posture: sender identity from `fetchVendorProfile()` (never a hardcoded store name), and
**never throws** — a failed email provider must not undo a delivery that physically happened.

The send happens **after the transaction commits**, never inside it. This is P3c's hardest-won
lesson: `createPayment()` originally ran inside the Prisma transaction, harmless against a stub but a
real HTTP call there holds a Postgres transaction open against a 5-second timeout.

## Deliberately excluded

- **Staff cancellation and refunds.** Cancelling a paid order means moving money back through
  Stripe; that is ADR-005 territory and a decision of its own, not a fifth button.
- **A staff order *detail* view.** The queue shows a three-item preview, not a full picking list.
  Real order detail, filters, search, bulk actions and order editing are **P6's admin panel**, which
  supersedes this queue wholesale. Tracked so it does not evaporate: see Open items.
- **Backwards or skip transitions**, including an "undo" for a mistaken advance. A wrong click is
  corrected in P6 with a proper audit story, not by making the ladder bidirectional here.
- **An index on `createdByUserId`.** No query in this slice filters by it; P6's "changed by" view is
  what will justify one. Adding it now would be building for an unwritten query.
- **Delivery slots, scheduling, courier integration, driver assignment, push/SMS.** None are in P4's
  roadmap line.
- **Reading `OrderStatusEvent.note` anywhere customer-facing.** P4a made this structurally
  impossible and P4b must not weaken it — this slice is precisely the one that gives staff a control
  writing near that column, which is why P4a built the guard in advance.

## Persistent docs: checked, no change needed

Recorded because "we looked and decided no" is more useful to the next reader than silence.

- **`specs/architecture.md`** — its §3.2 schema block is an explicitly abbreviated sketch that does
  not spell `OrderStatusEvent` out at all (`// … Address, OrderStatusEvent, Payment, …`), so the new
  column has nothing there to update. Its indexing paragraph already names "`Order(status,
  createdAt)` for the staff dashboard" and its pagination rule already mandates keyset on
  `(createdAt, id)` — this slice conforms to both rather than changing either. (The sketch's
  `Order.status @default(CONFIRMED)` disagrees with the real schema's `PENDING_PAYMENT`, but that
  drift predates this slice, was introduced by P3b, and `prisma/schema.prisma` is authoritative —
  chasing it here would be scope creep.)
- **ADR-004** — P4b is slice 3a's first real consumer, not an amendment to it.
- **ADR-005** — untouched: no money moves in this slice, which is exactly why staff cancellation and
  refunds are excluded.
- **`specs/design-system.md`** — the queue uses existing semantic tokens and the existing
  `OrderStatusBadge`; no new token or pattern.

## Open items carried forward

- **#104 — Resend has no verified sending domain.** No email from this slice can reach a real inbox
  in any environment. This is owner-action infrastructure, not code. P3c shipped its confirmation
  email under exactly this constraint and validated it *structurally* — the send is attempted,
  correctly addressed, with the right vendor sender identity. P4b does the same and `validation.md`
  records the row as **unverified with the reason**, rather than claiming a pass it cannot earn.
- **A staff order detail / full-history view** — deferred to P6, to be filed as its own issue at
  `/build-notes` rather than left as a sentence in this plan.
- **Roadmap carry-forward.** PR #128's promotion of P4a to production was never recorded in
  `specs/roadmap.md`'s change log, unlike every P3 promotion. Per the workflow's carry-forward rule,
  post-merge doc corrections ride the next slice's branch — so that row lands here (R28).
