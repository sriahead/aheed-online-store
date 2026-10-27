---
id: orders-grid-quickshop-cart-plan
title: "Orders grid, Quick Shop orders tile and cart Continue shopping (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-27
visibility: internal
summary: "Adds a Your orders tile to Quick Shop, turns /account/orders into a 1/2/3-column card grid with Reorder items and Save as list on each card, and adds Continue shopping to /cart (#1302)."
tags: [spec, storefront, orders, quick-shop, cart]
related: [roadmap]
---

# Orders grid, Quick Shop orders tile and cart Continue shopping (plan)

Issue `#1302`. Gate 1 approved by the owner on 2026-10-27. Storefront only: no schema change, no new
dependency, no new icon, no new server action.

**Goal:** a returning shopper can get from Quick Shop to their past orders, reorder or save one as a
list without opening its detail page, scan more orders at once, and leave the cart for the shop in one
tap.

**Scope (this slice):**
- `app/(storefront)/quick-shop/page.tsx`: a fifth tile, "Your orders" to `/account/orders`, appended
  after the existing four so their fixed order (`#1187` R3) is untouched. Icon `package` (already in
  the registry, so no `icons:build`). The heading line becomes "Quick ways to fill your basket
  without browsing from scratch." because a count in the sentence goes stale whenever a tile is added
  (the owner asked for the generic wording).
- `app/(storefront)/account/orders/page.tsx`: the list becomes a grid, `grid gap-3 sm:grid-cols-2
  xl:grid-cols-3`, in a `wide` container (was `standard`, 1024px, where three columns would be about
  320px each, too tight for the action row). Each card is a wrapper `div`; its upper part (number,
  date, status, item preview, count, total) stays a `Link` to the detail page; a separate action row
  below holds two forms, **Reorder items** (`reorderItems`) and **Save as list** (`saveOrderAsList`),
  styled as on the detail page. A form cannot sit inside the old card-wide `<Link>`, which is why the
  card is restructured. Cards in a row are equal height with the action row pinned to the bottom; the
  preview clamps to two lines (`line-clamp-2`) instead of one truncated line.
- `features/lists/save-order-as-list.ts`: an optional hidden `from` field. When it equals
  `"orders-list"` the action redirects to `/account/orders?list=saved|capped|empty` instead of the
  detail page, and the list page renders status messages for those three values. Any other value, or
  none, behaves exactly as today, so the detail page is unaffected. The value is compared against a
  constant, never used as a redirect target, so it cannot become an open redirect.
- `app/(storefront)/cart/page.tsx`: a **Continue shopping** link to `/categories` in the header row,
  shown whether or not the cart has lines. `/categories` matches the empty state's "Start shopping"
  and checkout's "Continue shopping".
- `tests/page-container.test.ts` registry entry for the orders page moves to `wide`;
  `tests/quick-shop-hub.test.tsx` and `tests/save-list-actions.test.ts` are updated; new tests cover
  the orders grid and the cart link.

**Deliberately excluded:**
- The cart **drawer** (`CartContents` is shared with it). The owner named the `/cart` page; the
  drawer already sits over the shop and closes. A drawer link is a separate decision.
- `reorderItems` is not changed: it already redirects to `/cart` with the restore notice, which is
  the right place to land from the list too.
- Reorder and Save as list are shown on **every** order status, as on the detail page today. Hiding
  them for cancelled or unpaid orders would make the list and detail pages disagree; if wanted it is
  its own change.
- The detail page renders no message for `?list=empty` today (the action can redirect there, the
  page ignores it). That existing gap is not fixed here; the list page does render one.
- After Save as list on page two of the list, the shopper returns to page one (the cursor is not
  carried). The message sits at the top of page one, so it is seen.
- No per-order name prompt for Save as list: the existing default name (`defaultListName`) applies,
  as it does on the detail page.
- Staff `/staff/orders`, the guest `/orders/lookup` page and the account hub are untouched.

**Open items carried forward:** none.
