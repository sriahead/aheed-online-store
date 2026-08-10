---
id: p3a-cart-foundation
title: "P3a — Cart foundation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-09
visibility: internal
summary: Make the inert "Add to Cart" real. Vendor-scoped Cart/CartItem behind a repository, one cart per (vendor, identity), guest carts on an opaque cookie that merge into the account cart on sign-in. No checkout, no orders, no payment.
tags: [p3, cart, multi-tenancy, storefront]
related: [roadmap, architecture, adr-004-multi-tenancy, multitenancy-slice2-vendor-enforcement, p2-5b2-visual-ui]
---

# P3a — Cart foundation (plan)

First slice of **P3 — Cart & checkout** (issue #93, epic #86). P2.5 shipped a storefront whose
"Add to Cart" was deliberately inert; this slice makes it real, and nothing more.
`requirements.md` holds the checkable criteria.

**Goal:** a shopper — signed in or not — can add products to a persistent, vendor-scoped cart,
see a live count in the header, and review/adjust it on a cart page. This is the data foundation
P3b's checkout consumes; getting cart *identity* right here is what stops P3b from inheriting a
broken model.

## Key design decisions

- **`Cart` + `CartItem`, both carrying `vendorId`** — ADR-004 decision 2 names `Cart` explicitly as
  a future tenant-scoped table. One cart per **(vendor, identity)**: shopping at Aheed and at
  SriMart gives you two independent carts, which falls straight out of row-level tenancy and needs
  no special-casing.
- **Identity is exactly one of `userId` or `guestToken`.** Enforced by two partial-safe composite
  uniques (`[vendorId, userId]`, `[vendorId, guestToken]`), both nullable, plus a repository-level
  invariant. A guest token is an opaque UUID in an **`HttpOnly` `Secure` `SameSite=Lax`, host-only**
  cookie — host-only deliberately mirrors slice 3c's isolation posture, so a cart cookie can never
  be read across vendor hosts even before the DB scoping is consulted.
- **Lazy creation.** No `Cart` row and no cookie until the first item is actually added. Creating a
  row per anonymous visitor would mean a DB write for every bot crawl — the storefront is public and
  indexed (`sitemap.ts`/`robots.ts` exist).
- **The shopper decides the merge — we never silently combine two carts** (owner decision). When a
  sign-in brings a guest cart and a saved cart together and **both hold items**, the shopper is
  shown the choice: *combine them*, *keep only my saved cart*, or *keep only the new items*.
  Combining sums quantities per product, capped at stock. Nothing is destroyed until they choose,
  and the guest cookie is cleared only once the choice is applied.
  - **No prompt when there is nothing to decide:** if the saved cart is empty the guest cart is
    simply adopted; if the guest cart is empty there is nothing to do. The prompt appears only in
    the genuinely ambiguous case, so the common path stays frictionless.
  - **While undecided, the saved (account) cart is the active one** — the conservative default, since
    it is provably the signed-in shopper's own.
  - This is what makes the shared-device case safe: a second person signing in on a shared browser
    is *asked* about the stranger's basket instead of inheriting it.
- **Detection is lazy, not a sign-in hook.** The pending-merge state is derived on cart read from
  "session present *and* guest cookie present" — idempotent, survives an interrupted sign-in, and
  keeps us out of Better Auth's internals (`getAuth()` already constructs fresh per request).
- **The cart stores no prices.** Only `productId` + `quantity`. Price is read from `Product` at
  render time and is *snapshotted* into `OrderItem` at order creation (P3b) — mirroring the
  `unitPrice` snapshot already sketched in `specs/architecture.md` §3.2. A cart that cached prices
  would silently serve stale money after a price change.
- **Stock is advisory here, authoritative in P3b.** Adding is capped at `Inventory.quantity` for
  immediate feedback, but the binding check is the atomic decrement at order creation (P3b). Two
  shoppers *can* hold the same last item in their carts — that is correct; a cart is not a
  reservation.
- **Mutations are server actions** in `features/cart/`, matching `features/reviews/`'s established
  shape. Reads go through `lib/repositories/cart.ts`, keeping the no-direct-Prisma ESLint guard green.

## Design reference (`docs/ui-ref/`)

The cart UI follows **`docs/ui-ref/src/components/CartDrawer.tsx`** — a right-side slide-out overlay
(`fixed inset-y-0 right-0`, `max-w-md`) with a header item count, a delivery-incentive banner, the
line-item list, and an empty state. Structure and layout come from the reference; **its colours and
constants do not**:

- The mockup's `bg-[#1B5E20]` etc. translate through the existing mapping table in
  `specs/design-system.md` §"Storefront components (P2.5b2)" (`#1B5E20` → `bg-primary`, …). Copying
  the hex literally would freeze every vendor to Aheed's green and silently undo ADR-004 slice 4's
  per-vendor theming — the exact bug #77 already fixed once.
- The mockup's `const freeDeliveryThreshold = 30` becomes **vendor data**, not a constant.

**Surface decision (owner-confirmed):** build the **drawer as the primary surface** *and* keep a real
`/cart` route. The drawer matches the reference; the route is the canonical URL the drawer links to,
the home of the post-sign-in merge prompt (sign-in redirects to a URL, not to a drawer), and the
no-JS fallback for an otherwise server-first storefront. Both render from the same server data.

## Vendor-neutrality rule for this slice

Nothing in the cart may assume a vendor. Concretely: no hex literals, no hardcoded delivery
threshold, no Aheed-specific copy ("Local Delivery to MK…" comes from `VendorConfig.localityName`),
and the drawer must render SriMart's blue theme correctly with zero component changes. This is the
ADR-004 rule of thumb applied to UI: onboarding a vendor changes **data only**.

## Known UI constraint

`components/product/ProductCard.tsx` wraps the **entire card in a `<Link>`**. An Add button nested
inside it would navigate on click. This slice adds a small **client-component island** for the
button that calls `preventDefault()`/`stopPropagation()` — chosen over restructuring the card, which
would churn P2.5b2's just-shipped visual work for no user-visible gain.

## Scope (this slice)

- Prisma: `Cart`, `CartItem` (+ additive migration). Vendor-scoped, per-vendor composite uniques,
  `vendorId`-leading indexes.
- Prisma: three **vendor-configurable delivery columns** on the existing `VendorConfig` satellite
  (`deliveryFeePence` default `349`, `freeDeliveryThresholdPence` nullable, `minimumOrderPence`
  default `0`), same migration. Pulled forward from P3b because the reference cart's free-delivery
  banner needs the threshold — building the cart without it would mean reopening this UI in P3b.
  **P3a reads only the threshold**; applying fee and minimum to a total stays P3b.
- `lib/repositories/cart.ts`: `getCartRepository()` following `reviews.ts`'s shape (request-scoped
  `vendorId`, fresh per call) — resolve-or-create, add, set quantity, remove, read summary, merge.
- `lib/cart-identity.ts`: guest-token cookie read/issue/clear + "which identity is this request".
- `features/cart/`: `add-to-cart.ts`, `update-quantity.ts`, `remove-item.ts`, `resolve-merge.ts`
  server actions.
- UI: `AddToCartButton` client island on product cards + product detail; live header count replacing
  the inert button; **`CartDrawer`** per the reference (line items, quantity stepper, remove,
  subtotal, free-delivery progress from vendor data, empty state); `/cart` route rendering the same
  content plus the **merge-choice prompt** when a decision is pending.
- Docs: `specs/design-system.md` — the mockup→token table gains the drawer's elements, and the
  "cart controls are inert until P3" line is now false and must be corrected.
- Tests: cart quantity/merge logic as pure functions, plus repository-level invariants.

## Deliberately excluded

- **Checkout, `Address`, `Order`/`OrderItem`/`Payment`, order creation, stock decrement** — P3b.
- **Applying the delivery fee and minimum-order rule to a payable total** — P3b. The columns land
  here (above) and P3a renders only the *free-delivery progress* the reference cart shows; the cart's
  money line stays a **subtotal**. No order minimum is enforced at this stage, since there is nothing
  to check out to yet.
- **Stripe, webhooks, confirmation email** — P3c.
- **"Shop your list"** — P3d.
- **Abandoned-cart cleanup.** Guest carts accumulate without a reaper. Not a P3a problem (volume is
  ~zero), but it is a real long-term data-growth issue → tracked as a follow-up issue, not silently
  dropped.
- **Cart-count optimistic UI / client-side cart state.** The count re-renders via `revalidatePath`;
  no client store, no optimistic updates. Keeps the storefront's zero-client-JS-by-default posture
  from P2.5b2 intact except for the one button island.
- **Saved-for-later / wishlists / quantity-based pricing** — not in P3's roadmap scope at all.

## Open items carried forward

- **An ignored merge prompt is P3b's problem.** A shopper can leave the choice unresolved and carry
  on browsing; the saved cart stays active and the guest cookie survives. **P3b's checkout must force
  resolution before an order is created**, so an order can never be placed against a cart the shopper
  never confirmed. Called out here so P3b's spec inherits it explicitly rather than rediscovering it.
- Abandoned guest-cart retention/cleanup policy → **#94**; likely P7 (hardening) alongside the GDPR
  retention review, since a guest cart is weakly personal data.
- **Cookie clearing is deferred to the next mutation in the automatic-resolution case.** Next forbids
  writing cookies during a Server Component render, so the read path can only reconcile the database.
  Once the guest cart row is gone the cookie is inert (it resolves to nothing), and the mutation layer
  drops it on the next write. Discovered during build, not at spec time.
