---
id: 2026-09-14-p10-shared-fulfilment-state
title: P10 Shared Fulfilment State
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-14
visibility: internal
summary: Promote the fulfilment method from four disconnected client states to one server-readable cookie, and collapse the duplicated delivery-fee and tracker arithmetic into the existing pure functions.
tags: [fulfilment, checkout, cart, delivery, click-and-collect]
---

# P10 Shared Fulfilment State

Closes **#748**. Observed on deployed `staging` at commit `b85fc2b` (2026-09-14), during the
review the DO-NOT-PROMOTE hold in `docs/model-handoff.md` is waiting on.

**Goal:** make "which fulfilment method is this shopper using" a single value that the server can
read, so the header, the cart drawer, `/cart` and `/checkout` cannot disagree — and make the
minimum-order and free-delivery trackers derive from one pure function instead of three
hand-rolled copies.

## Why this slice exists

Three separately-reported defects share one cause. The delivery postcode is durable state: it
lives in a cookie (`lib/delivery-cookie.ts`) written by a server action
(`features/storefront/delivery.ts`) and read by every server-rendered surface. The fulfilment
**method** has no equivalent. It exists only as four independent `useState` values:

| Where | Line |
|---|---|
| `components/layout/LocationControl.tsx` (rendered **twice** — `Header.tsx:233` desktop, `:333` mobile, each with its own state) | `:20` |
| `components/checkout/CheckoutForm.tsx` | `:57` |
| `components/checkout/CheckoutSummary.tsx` | `:13` |

They are stitched together by a `window` CustomEvent (`CheckoutForm.tsx:139`) and a `localStorage`
blob. No server component can read any of it, so the drawer and `/cart` are structurally blind to
the method — and the header's own two instances can already disagree with each other.

Because nothing shares the value, each surface that needs money or progress computes it itself:

- `lib/cart-rules.ts:111` `deliveryProgress()` knows only the free-delivery threshold. It has no
  concept of the vendor minimum and no concept of method, so `CartContents.tsx:39-59` renders
  "FREE Local Delivery" even under Click & Collect.
- `app/(storefront)/checkout/page.tsx:59` calls `computeTotals(...)` **without** its `method`
  argument. That argument exists and correctly zeroes the fee for collection
  (`lib/order-totals.ts:73,87`) — it is simply not passed.
- `components/checkout/CheckoutSummary.tsx:38-39` re-derives the fee and total itself rather than
  calling `computeTotals`, under a hardcoded `"Delivery"` label. That is the reported
  "Delivery FREE". The same duplicate arithmetic drops `discountPence` entirely, so loyalty
  redemptions and discount codes never appear in the summary.

The vendor minimum is already enforced correctly server-side for both methods
(`lib/repositories/orders.ts:273`). It is the *display* that is missing, not the rule.

**Scope (this slice):**

1. **A fulfilment-method cookie**, modelled exactly on the postcode one that already works.
   `lib/fulfilment-cookie.ts` holds the cookie name and a pure parser — a separate module from the
   action for the reason `lib/delivery-cookie.ts` documents: `features/storefront/delivery.ts` is
   `"use server"` and may export only async functions (CLAUDE.md's Server Actions rule, the
   P6b1/#159 trap). `setFulfilmentMethod` joins that action file.
2. **One request-scoped accessor**, `lib/fulfilment-service.ts`, that reads the cookie and
   reconciles it against what the vendor actually offers: a vendor with `offerCollection: false`
   is always `DELIVERY`, whatever the cookie says. One place resolves this, so the three surfaces
   cannot drift.
3. **One pure progress function** in `lib/cart-rules.ts`, superseding `deliveryProgress()`, that
   expresses the vendor minimum *and* the free-delivery threshold *and* the method. The drawer,
   `/cart` and `/checkout` all render from it.
4. **`LocationControl` becomes a writer, not an owner.** Its method comes from the server; its
   toggle submits `setFulfilmentMethod`. Two consequences fall out for free: the desktop and
   mobile instances can no longer disagree, and the selection survives navigation.
5. **The postcode becomes editable again.** `LocationControl.tsx:73-81` opens the modal only when
   `!(postcode && deliverable)`, so once a deliverable postcode is stored nothing on the page can
   reopen it. Separately, the effect at `:25-41` lists `isPending` in its dependencies and forces
   `DELIVERY` whenever `postcode && deliverable`, so submitting a postcode from Click & Collect
   ends by yanking the shopper back to Delivery.
6. **`CheckoutSummary` stops computing money.** It renders figures it is handed by the page, which
   gets them from `computeTotals` with the method passed. The CustomEvent bridge is deleted.
7. **The drawer closes on click.** `CartDrawerShell.tsx:46-49` does close on pathname change and
   that code is deployed — but `CartContents.tsx:193` is a bare `<Link>` to a `force-dynamic` page
   doing five sequential database round-trips, so the drawer stays open for the whole server hop
   and reads as "does not close".

**Deliberately excluded:**

- **Checkout address lookup and vendor logo upload** — **#749**. `CheckoutForm`'s
  `document.querySelector("form")` bug at `:68` and `:106` is that issue's, not this one's, even
  though this slice edits the same file. This slice removes only `fulfilmentMethod` from the
  `localStorage` payload and leaves the rest of that logic untouched for #749.
- **Staff configuration of delivery slots and Express** — **#750**. `SlotPicker` and its
  `offerDeliverySlots`/`expressCollectionEnabled` gating are not touched here.
- **Changing minimum-order enforcement.** `placeOrder` already refuses a below-minimum order for
  both methods. This slice makes the shortfall *visible* earlier; it does not add client-side
  gating and does not disable the Place Order button.
- **The express surcharge**, and any change to how `isExpress` prices an order.
- **A new fulfilment field on `Order`.** The method already reaches `createOrder` through
  `features/checkout/place-order.ts:169`; this slice changes where the UI reads it from, not what
  is persisted on an order.
- **Consent/banner changes.** Like the postcode cookie, this is a functional store preference
  inside the essential set `components/consent/CookieBanner.tsx` already describes, written only
  in response to a deliberate submission.

**Open items carried forward:**

- **#363** — vendor timezone is a hardcoded constant. Untouched and still open; it is upstream of
  slot scheduling (#750), not of this slice.
- **#749** and **#750** are the other two slices of this review. The DO-NOT-PROMOTE hold in
  `docs/model-handoff.md` should not be lifted on this slice alone.

## Risk worth stating before building

Deriving `CheckoutForm`'s method from a server prop means toggling Delivery/Click & Collect at
checkout costs a server round-trip and a re-render. Uncontrolled inputs keep their DOM values
across a re-render, so typed contact and address details should survive — but "should" is not
evidence, which is why **R14** exists as an explicit live check rather than an assumption. If it
turns out not to hold, the fallback is `useOptimistic` over the same server value, not a second
copy of the state.
