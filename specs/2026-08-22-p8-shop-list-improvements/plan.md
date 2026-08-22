---
id: p8-shop-list-improvements
title: "P8.x Shop Your List Improvements (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-22
visibility: internal
summary: Add partial-match fallback for Shop Your List and address Cart/Header UI feedback.
tags: [ui, p8, cart]
---

# P8.x Shop Your List Improvements (plan)

**Goal:** Improve the UX of the "Shop your list" feature by adding partial-match fallback, increasing its discoverability, and fixing a Cart popover navigation bug.

**Scope (this slice):**
- Update `lib/shopping-list.ts` to implement partial-match fallback. If no candidate matches all terms, it will score candidates by the number of matched terms, and return the highest-scoring ones as `ambiguous`.
- Add the "Shop your list" link to the global header (next to the search bar) so it is discoverable outside of the full cart view.
- Ensure the Cart popover (or FAB cart) automatically closes when the user clicks "Proceed to checkout" or "View full cart", preventing the cart from obscuring the next view.

**Deliberately excluded:**
- Issue #116 (Saved shopping lists) — remains deferred as it requires significant schema and account UI additions.
- Any new database tables or Prisma migrations.

**Open items carried forward:**
- Issue #116.
