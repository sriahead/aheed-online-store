---
id: p4a-order-history
title: "P4a — Order history & status timeline (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-11
visibility: internal
summary: "Orders get a permanent home in the account area: a vendor-scoped, keyset-paginated list of the signed-in shopper's past orders and a detail page showing items, address and a status timeline built from the OrderStatusEvent rows P3 already writes. Read-only — no transitions, no schema change."
tags: [p4, orders, account, storefront]
related: [roadmap, architecture, p3b-checkout-order-core, p3c-stripe-payments, multitenancy-slice2-vendor-enforcement, multitenancy-slice3c-auth-cookie-scoping]
---

# P4a — Order history & status timeline (plan)

The first P4 slice (issue #122, epic #87). P3 closed with a complete paid-order path — a cart
becomes an order, Stripe settles it, a webhook confirms it — but the moment a shopper navigates away
from `/checkout/{orderNumber}`, the order is effectively gone. The only route back is a URL they may
not have kept. This slice gives orders a permanent, authenticated home.

**Goal:** a signed-in shopper can open their account, see every order they have placed with *this*
vendor newest-first, open any one of them, and see exactly what they bought, where it went, and how
far along it is — served entirely from persisted state.

## What is already true (verified at `/orient`, not assumed)

This slice builds far less than P4's roadmap line suggests, because P3 left more behind than the
line records:

- `Order`, `OrderItem`, `Address` and `OrderStatusEvent` all exist in `prisma/schema.prisma`, and
  `Order` already carries `@@index([vendorId, createdAt])` — precisely the index a vendor-scoped,
  newest-first history needs. **No schema change, no migration.**
- **The audit trail is already being written.** `lib/repositories/orders.ts` calls
  `tx.orderStatusEvent.create()` in three places (order placed, order released, payment confirmed).
  Nothing about the trail needs building; P4a adds the *read* path and the rendering.
- `getByOrderNumber()` already enforces P3b's ownership rule and is already vendor-scoped.

What is genuinely missing is a list read, an owned-order read, and two routes.

## Scope (this slice)

**A pure status module — `lib/order-status.ts`, no I/O.**
`orderStatusLabel(status)` maps each `OrderStatus` to customer-facing copy, and
`buildTimeline(events)` turns raw `OrderStatusEvent` rows into an ordered, deduplicated timeline.
Both are pure and unit-tested with no database, matching `lib/cart-rules.ts`, `lib/order-totals.ts`,
`lib/delivery.ts` and `lib/shopping-list.ts`. P4b extends this same module with transition legality,
so the module exists now rather than being invented twice.

**One decision inside it is load-bearing and worth stating outright: the timeline never renders
`OrderStatusEvent.note`.** Today's notes are system-written and harmless. But P4b hands staff a
control that writes this column, and the first time someone types *"customer never answers the door,
leave with next door"* into it, a customer-facing page that renders `note` becomes a live incident.
Building the timeline out of `status` from day one costs nothing now and removes the failure mode
entirely — rather than relying on a future slice to remember a constraint this slice could simply
enforce. `buildTimeline` therefore does not accept, carry, or return a note field at all; the
type makes the leak unrepresentable rather than merely unlikely.

**Two repository reads — `lib/repositories/orders.ts`.**
`listForUser(userId, { take, cursor })` returns a keyset-paginated page of that user's orders for the
current vendor, copying `ProductRepository`'s established shape exactly: order by `(createdAt, id)`
descending, over-fetch by one to detect a next page without a `COUNT`, `cursor` + `skip: 1`, and
**never `OFFSET`** (`specs/architecture.md`'s pagination strategy).

`getForUser(orderNumber, userId)` is a *second*, stricter read alongside the existing
`getByOrderNumber()`. The distinction matters and is not pedantry. `getByOrderNumber()` implements
P3b's capability-URL semantics: a guest order has no owner, so anyone holding the unguessable number
may view it. That is right for `/checkout/{orderNumber}`, and wrong for `/account/orders/{n}` — a
page that claims to be *your* order history must not render an order that isn't yours merely because
you pasted a number into the address bar. `getForUser` filters on `userId` directly, so a guest order
and another member's order both resolve to `null` and 404. The existing method is left untouched, so
P3's validated behaviour is preserved rather than quietly widened.

**Two routes — `app/(storefront)/account/orders/`.**
`page.tsx` lists orders ten at a time with an "older orders" link carrying `?cursor=`, matching how
`categories/[slug]` and `search` already page. `[orderNumber]/page.tsx` renders one order plus its
timeline. Both are `force-dynamic` (they read the session) and both redirect to `/login` when
unauthenticated, following `app/(storefront)/dev/page.tsx`'s precedent. The account shell gains a
link, so the feature is reachable without knowing the URL.

**Shared presentation, extracted rather than duplicated.**
`/checkout/{orderNumber}` already renders an items-and-totals card and a delivery-address card. The
order detail page needs the same two, so they move to `components/orders/` and both pages consume
them. This is the repo's reuse-before-create rule applied to markup: the alternative is two copies of
the money breakdown, which is exactly the kind of duplication that drifts. The confirmation page's
own status banners and copy are **not** touched — only the two cards move — and a requirement pins
its rendered output as unchanged, because a refactor of validated P3 code is the risk this slice
actually carries.

## Deliberately excluded

- **Any status transition.** No staff controls, no advance action, no writes of any kind. This slice
  writes nothing, which is what makes every one of its requirements provable by reading. Transitions
  are P4b (#125).
- **Delivery emails.** P4b, shipped with the transitions that trigger them (P3c's precedent: a state
  change the customer never hears about is an incomplete unit).
- **Guest order lookup.** A guest has no `userId`, so no guest order can appear in any history.
  Guests keep the `/checkout/{orderNumber}` capability URL they already have. A real lookup form
  needs a decision on the credential pair, on rate limiting, and on enumeration — a security
  decision, not a UI addition — tracked as **#123**.
- **Reorder from a past order.** Inherited from P3d's issue #114 and deliberately homed in neither
  P4 slice: it is a *cart write*, which would break this slice's read-only property, and it is not
  about delivery status, which is P4b's subject. Tracked as **#124**, with the real problems named
  (deactivated products, changed prices, and P3d's review step as the obvious reuse).
- **Invoices, PDFs, cancellation or refund requests.** Not in P4's roadmap line; P6/P7 territory.
- **Filtering, searching or sorting the history.** Ten per page, newest first. A shopper with enough
  orders to need a filter is a problem this store does not have yet.
- **Any schema change or migration.** The models and the index already exist.

## Open items carried forward

None blocking. This slice needs no credential, no external resource and no schema change — it is
deliberately the half of P4 that can be built and validated with nothing outstanding.

Two items ride along on this branch under the workflow's carry-forward rule (post-merge doc changes
land on the next slice's branch, not a PR of their own):

- **`specs/sdd-workflow.md`'s delivery-board blockquote is stale.** It states that `Backlog` and
  `In Review` "do not exist yet" and instructs the reader to use `Todo` — contradicted by the live
  board, which has all four options, and by `CLAUDE.md`, which records the rename as done. A reader
  following the workflow doc today would file status wrongly.
- **#119 — local `.env` and `.dev.vars` point at different Neon projects.** Not this slice's to fix,
  but it is exactly the trap `specs/sdd-workflow.md`'s Validate stage warns about: a live check that
  silently validates against a database the app isn't using. It must be resolved *before* this
  slice's validation, not diagnosed during it.

The P4 *phase* also still carries **#104** (Resend has no verified sending domain) and **#113**
(production runs Stripe test-mode keys). Neither gates P4a, which sends no email and takes no money.
