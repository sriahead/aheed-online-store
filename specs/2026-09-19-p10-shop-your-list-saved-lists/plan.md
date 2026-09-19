---
id: 2026-09-19-p10-shop-your-list-saved-lists
title: "Surface saved lists on /shop-your-list (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-19
visibility: internal
summary: A signed-in shopper's saved lists appear on /shop-your-list itself, above the paste box, so re-opening one is a click instead of a trip through /account.
tags: [shop-your-list, saved-lists, p10]
related: [2026-09-18-p116-saved-shopping-lists]
---

# Surface saved lists on /shop-your-list (plan)

Closes **#806**, filed as a direct follow-up to **#116** (`specs/2026-09-18-p116-saved-shopping-lists/`).
`#116` shipped saved lists as a separate destination (`/account/lists`) reachable only from the
account menu or a save confirmation. Owner feedback after using it: clicking the header's "Shop
List" link (`/shop-your-list`) should show the shopper's saved lists right there, so re-opening one
doesn't require a detour through `/account`.

**Goal:** a signed-in shopper who already has saved lists sees them the moment they land on
`/shop-your-list`, and can open one in one click. A shopper with no saved lists, and every guest,
sees the page exactly as it renders today.

**Scope (this slice):**
- `app/(storefront)/shop-your-list/page.tsx` (already a Server Component, already resolves
  `canSave` via `getUserId()`) additionally calls the **existing**
  `getShoppingListService().list()` when `canSave` is true, and renders a "Your saved lists"
  section above the paste form when the result is non-empty.
- Each row shows the list's name and item count and links to `/account/lists/<id>` — the page
  `#116` already shipped. **Opening a list does not add a new route, a new resolve path, or a new
  add-to-cart mechanism.** `/account/lists/[listId]/page.tsx` is unchanged: it already redirects
  signed-out, 404s a list that isn't the current vendor+user's, and otherwise renders
  `ListReview` against the list's re-matched lines. This slice reuses that page by linking to it,
  deliberately — not by duplicating its resolve logic inline into `/shop-your-list`, which is the
  fork this issue's proposal left open. Reusing the existing page means zero new matching logic
  and one page to keep correct instead of two.
- **Capped to the 5 most recently updated lists**, in the order `listShoppingLists` already
  returns them (`updatedAt` descending) — a shopper at the 20-list ceiling should not have the
  paste box pushed off the first screen. A "Manage your lists →" link to `/account/lists` is
  always shown alongside the (possibly capped) rows, whether there are 2 saved lists or 20 — one
  control for "see the rest" and "rename/delete", rather than two differently-worded links for the
  capped and uncapped cases.
- No new repository or service function. `lib/repositories/shopping-lists.ts` and
  `lib/shopping-lists-service.ts` are untouched — `listShoppingLists`/`getShoppingListService()`
  already return exactly the shape (`id`, `name`, `itemCount`, `updatedAt`) this needs, already
  scoped by vendor and user, already exercised live by `#116`'s own `/validate`.
- The row markup (name, item count with `item`/`items` pluralisation, chevron, link) is copied from
  the equivalent three lines in `app/(storefront)/account/lists/page.tsx`, not extracted into a
  shared component — it is four JSX lines with no forms attached here (no rename/delete on this
  page), and `/account/lists/page.tsx`'s version carries two sibling forms this page has no use
  for. Two near-identical small blocks beat a shared component parameterised only to strip half of
  itself out for the second caller.

**Deliberately excluded:**
- **A "quick add" that skips the review screen.** `#116`'s whole design puts a review step between
  "here's a saved list" and "here's what's in your cart" for a reason: an ambiguous line needs a
  choice made, and an out-of-stock line needs to be seen, not silently dropped. This issue's own
  proposal ruled a direct-add path out explicitly.
- **Inlining the resolve into `/shop-your-list` instead of linking to `/account/lists/[listId]`.**
  Named as an open mechanical question in `#806`; resolved here as "link, don't duplicate" — see
  Scope above.
- **Changing what `/account/lists` itself shows or how rename/delete work there.** Unmodified by
  this slice.
- **Any change for guests.** Saved lists still require an account (`#116`, `#801`); a guest's
  `/shop-your-list` render is byte-for-byte what it is today.
- **A cap other than 5, or a user-configurable cap.** Five was picked as "obviously several, not a
  wall of rows"; not user-facing configuration, and not worth a `VendorConfig` column for a
  cosmetic display limit.

**Open items carried forward:** none. `#801` (guest saved lists) and `#802` (ambiguous-line product
memory) remain open, unaffected by and unrelated to this slice's own scope.
