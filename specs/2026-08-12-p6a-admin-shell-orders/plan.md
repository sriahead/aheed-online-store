---
id: p6a-admin-shell-orders
title: "P6a — Admin panel shell & order dashboard (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-12
visibility: internal
summary: Turns three orphan /staff pages into a real admin panel — a new (admin) route group with its own layout and tenant gate — and replaces P4b's stopgap order queue with a filterable, searchable dashboard plus the first order detail view staff have ever had.
tags: [p6, admin, staff, orders, rbac, multi-tenancy]
related: [adr-004-multi-tenancy, architecture, p4b-order-status-transitions, p4a-order-history]
---

# P6a — Admin panel shell & order dashboard (plan)

**Goal:** give Aheed's owner and staff an actual panel. Today `/staff/orders`, `/staff/loyalty` and
`/staff/discounts` are three unrelated pages with no index, no navigation between them, and the
*shopper's* header rendered above each one — reachable only by typing the URL from memory. This
slice makes them one navigable surface, and upgrades the order queue from P4b's deliberate stopgap
into a dashboard that can answer "what happened to order AHD-…?" rather than only "what do I pack
next?".

It is also the slice that finally **reads** `OrderStatusEvent.createdByUserId`. P4b added that
column to build an audit trail and shipped with nothing able to display it; until this slice, the
record of who moved an order existed only in the database.

## Scope (this slice)

### 1. A real `(admin)` route group

A new `app/(admin)/` route group with its own `layout.tsx`. The three existing pages move from
`app/(storefront)/staff/*` to `app/(admin)/staff/*`. **Route groups are URL-invisible, so every
path is unchanged** — `/staff/orders` stays `/staff/orders`. This is a file move plus a new layout,
not a routing change.

Two things the storefront layout does that the admin layout **must** keep doing, and which are the
main risk in the move:

- **The tenant gate.** `app/(storefront)/layout.tsx` redirects to `/coming-soon` when
  `getCurrentVendorProfile()` resolves nothing. That gate is not decoration:
  `getCurrentVendorId()` in `lib/tenant.ts` **throws** on an unresolvable host, and its own comment
  records that the layout redirect is what stops anything reaching the throw. An `(admin)` layout
  without the gate turns an unknown host on `/staff/orders` from a redirect into an unhandled
  error.
- **The vendor brand variables.** ADR-004 slice 4 injects eight brand primitives *and* re-declares
  the semantic tokens, for the reason spelled out in that layout's comment: Tailwind v4 emits
  `--color-primary: var(--color-brand-green-dark)` at `:root`, so overriding only the primitives
  leaves the semantic token frozen to the default palette. The admin panel is vendor-branded too,
  so it needs the same block.

Copying that block into a second layout would guarantee the two drift. It moves to **one shared
module** that both layouts import — reuse before create, and the same extraction P4a did for the
order cards, one layer up.

What the admin layout deliberately does *not* render is `components/layout/Header` — the shop
header, search bar, department scroller and hero chrome belong to shoppers. In its place: a compact
panel navigation.

**The navigation is role-aware, but navigation is not the gate.** `/staff/loyalty` and
`/staff/discounts` are `ADMIN`-only while `/staff/orders` admits `STAFF` too; showing a packer two
links that will only ever refuse them is bad UX. So the layout resolves the viewer's vendor role to
decide *which links to draw*. Every page keeps the `requireVendorRole` call it already has, with
the same allowed roles. This distinction is load-bearing and easy to get wrong: a layout is not an
authorization boundary in Next's App Router — a page renders on its own, and the server actions
behind these pages re-check their own permissions anyway (P4b/P5a/P5b all do).

### 2. `/staff` — the panel's front door

A new landing page: the sections this viewer can actually use, and the count of orders currently
awaiting staff action. Small, but it is the thing that makes the other pages discoverable without
someone remembering three URLs.

### 3. The order dashboard (#129)

**Status filter, with the shipped default preserved.** `listForStaff` currently hardcodes
`STAFF_QUEUE_STATUSES` (`CONFIRMED`, `OUT_FOR_DELIVERY`) — P4b chose that deliberately, and its
reasoning is still right: a queue is a worklist, and padding it with rows whose only control is
disabled makes it worse. But it also means a delivered order from last week is currently
unreachable by staff at any URL. So: **no query parameters keeps exactly today's behaviour**, and
an explicit `?status=` (including `?status=all`) widens it. The packing floor's default doesn't
move; history becomes reachable.

**Search** over order number and buyer email (`Order.guestEmail`, or the related `User.email` for a
member's order), case-insensitive, composing with the status filter. That is the shape of the real
question staff get asked — someone phones about an order and quotes a number or an email address.

**A detail view at `/staff/orders/{orderNumber}`** — the first one staff have ever had. Items,
delivery address, money breakdown, buyer email, the advance control, and a **staff timeline**
carrying `OrderStatusEvent.note` and the acting user's name.

That timeline needs care, because P4a made an explicit structural promise in the other direction.
`buildTimeline` and its `StatusEventInput` type in `lib/order-status.ts` have **no `note` field at
all**, and `getForUser` does not select the column — so an internal note ("customer never answers,
leave it next door") appearing on a shopper's own order page is *unrepresentable*, not merely
guarded against. Widening `buildTimeline` to serve the staff view would quietly delete that
guarantee. Instead the staff view gets its **own** builder and its own type, and P4a's stays
untouched — the guarantee holds because the customer path still cannot express a note, not because
someone remembered to filter one out.

`getForStaff` is likewise a **third** order read beside `getByOrderNumber` (P3b's capability-URL
rule) and `getForUser` (P4a's owner-only rule), and deliberately neither: staff authority comes
from `requireVendorRole` plus `vendorId` in the `WHERE`, so a **guest** order with no owner and
another member's order are both legitimately visible to that vendor's staff. Three methods with
three different rules is the honest shape; collapsing them would mean one of the three pages gets
the wrong rule.

### 4. No schema change

Nothing here needs a migration. `Order` already carries `@@index([vendorId, createdAt])` and
`@@index([vendorId, status, createdAt])` from P3b, which serve the default queue, the status filter
and the keyset pagination. `OrderStatusEvent.createdByUserId` and its `User` relation already exist
from P4b. Search is the one read with no index behind it — see *Known limits*.

## Deliberately excluded

- **Catalogue management** (products, categories, availability, image upload) — **#159, P6b**. It
  is the phase's only genuinely new capability and the first *write* through `lib/storage`; it does
  not belong in a shell slice.
- **Bulk actions** on the dashboard (select-many, advance-many). #129 mentions them; a bulk
  compare-and-set is a different concurrency problem from P4b's single-order one, and inventing it
  inside a shell slice is exactly the scope creep the loop exists to prevent.
- **Staff cancellation and refunds** — ADR-005 territory, unchanged since P4b said so.
- **Editing an order** (items, address, money). Orders snapshot their money and address by design
  (P3b); an edit path is a real decision, not a form.
- **Customer directory** (#160) and **reports** (#161) — deferred out of P6 at Propose.
- **Loyalty tier create/delete** (#136) and the **theme catalogue** (#75) — both moved off P6 at
  Propose; `/staff/loyalty` moves into the shell unchanged, edit-only.
- **Renaming `/staff` to `/admin`** — rejected at Propose: it breaks three shipped URLs and muddies
  the STAFF-vs-ADMIN split, where `/staff` is the right word for a packer's queue.
- **Search over recipient name or postcode.** Both live on `Address`, behind a join, with no index
  and no strong staff use case next to number-and-email. If it is wanted, it is its own change.

## Known limits (accepted, not hidden)

**Search is an unindexed scan** over this vendor's orders — a case-insensitive `contains` on
`orderNumber`, `guestEmail` and the joined `user.email`. At Aheed's current order volume that is
irrelevant, and the alternative (trigram indexes) needs `pg_trgm` and `$queryRaw`, which
`CLAUDE.md` forbids in application code — the same wall P2 hit for product search and P3d hit for
list matching, resolved the same way: ship the honest version, and let real data volume justify the
index work. This gets a tracked issue at build-notes time rather than a comment.

## Open items carried forward

- **#104** — Resend still has no verified sending domain, so nothing in this slice changes the fact
  that P4b's delivery emails cannot be proven to reach a real inbox. Not this slice's problem, but
  the advance control on the detail view triggers those emails, so it stays worth stating.
- **#113** — production still runs Stripe test keys; the storefront is not open. This slice is
  staff-facing and unaffected, but it is why reports (#161) were deferred rather than built.

## Persistent doc affected

`specs/architecture.md` currently states, of ADR-004 slice 3b: *"No Next middleware is used (edge
runtime is forbidden) — **the storefront layout gates the tenant**."* That becomes wrong the moment
a second top-level layout exists. It is updated in this slice to name both layouts, so a future
reader adding a third route group learns the gate is a per-layout obligation rather than a fact
about one file.
