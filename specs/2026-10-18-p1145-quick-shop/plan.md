---
id: p1145-quick-shop
title: "Quick Shop: one name for the paste-a-list feature, and simpler page copy (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-18
visibility: internal
summary: "Issue #1145: rename the paste-a-list feature to Quick Shop everywhere a shopper sees it (header, page, cart and saved-lists links) and cut the /shop-your-list copy to one label, one quantity example and the line limit. Copy only; no behaviour change."
tags: [shop-your-list, copy, header, p10]
related: [p1142-header-dropdown-search-room, p3d-shop-your-list]
---

# Quick Shop: one name for the paste-a-list feature, and simpler page copy (plan)

Issue `#1145`. The owner asked on 2026-10-18 for a better name and simpler text. Both decisions were
taken at Propose and are recorded on the issue: the name is **Quick Shop**, and the copy is the
"Shortest" option.

**Goal:** a shopper meets one name for the feature wherever they find it, and the page asks for a
list in as few words as possible. Nothing about how a list is matched, reviewed, saved or added
changes.

## What Orient found

Facts about the repository on 2026-10-18.

1. **The feature has three names today.**
   - The header link (`components/layout/ShoppingListLink.tsx`, since `#1131`/`#1142`) says
     "Shopping List", with `aria-label="Shopping list"`.
   - The page (`app/(storefront)/shop-your-list/page.tsx`) says "Shop your list" in its `h1` and
     `metadata.title`.
   - `/cart` (`app/(storefront)/cart/page.tsx`) and the empty state of `/account/lists`
     (`app/(storefront)/account/lists/page.tsx`) link to it as "Shop your list".
   - The submit button (`components/cart/ShopYourList.tsx`) says "Match my list".
2. **The page copy is split across two files.**
   - The page renders the `h1` and an intro paragraph ("Paste your shopping list and we'll find
     each item. Nothing goes in your cart until you say so.").
   - `ShopYourList` renders the textarea's `<label>` ("One item per line"), a quantity hint above
     the box ("Quantities are understood — 2x X, 3 X or X x3. Up to 100 lines.", or a neutral
     version without a product), the textarea and the button.
3. **The example product is already vendor data.** `lib/shopping-list-examples.ts` picks the first
   of the vendor's in-stock product names (`#729`), and a vendor with none gets neutral wording. The
   "Chicken Nuggets 500g" the owner saw is Aheed's own product. Nothing here needs a vendor
   setting.
4. **The line limit is silent.** `parseList()` (`lib/shopping-list.ts`) stops at
   `MAX_LIST_LINES` (100) and drops the rest with no error. The hint is the only place a shopper
   learns the limit, so it stays.
5. **The textarea placeholder is a separate, guarded decision.** It is `LIST_PLACEHOLDER`, "Type or
   paste your list, one item per line". `#1077` chose it deliberately, because a worked example
   there read as a list already typed. It nearly repeats the new label; see "Open items".
6. **Tests that pin today's wording:**
   - `tests/header-shopping-list.test.tsx` checks the link's name, "Shopping list".
   - `tests/shop-list-review-copy.test.tsx` ("hint placement", `#1077` R14) finds the hint by the
     literal "Quantities are understood" and checks that it comes before `<textarea`.

## Design

- **One name, "Quick Shop", on every shopper-facing surface:**
  - the header link's visible text and its `aria-label` (identical, so the label contains the
    visible text, per WCAG 2.5.3)
  - the page `h1` and `metadata.title`
  - the `/cart` link
  - the `/account/lists` empty-state link
- **The page's intro paragraph is removed. The textarea's label carries the instruction instead:**
  "Paste your list, one item per line." The field keeps a real `<label for="list">`, so its
  accessible name is that sentence.
- **The hint becomes one sentence**, still above the textarea (`#1077` R14 stays true):
  - With an example: `Add a number for more than one: 2 <example> (up to 100 items)`.
  - Without one: `Add a number for more than one, like 2 before the item (up to 100 items)`.

  The number comes from `MAX_LIST_LINES`, not a literal. Only one quantity form is shown. The
  parser still accepts `2x`, `3` and `x3`, as before; the hint simply stops listing all three.
- **The button reads "Find my items"**, and "Finding…" while pending.
- **The URL stays `/shop-your-list`.** Renaming it would break bookmarks, the sitemap entry and
  every existing link, for a word a shopper never types.

## Deliberately excluded

- Any change to parsing, matching, AI normalisation, the review step, saving lists or adding to the
  cart.
- Code identifiers (`ShopYourList`, `ShoppingListLink`, the route folder). No shopper sees them.
- "Your saved lists", "Save this list for next time", "Manage your lists" and the `/account/lists`
  page title "Your lists". These name the saved lists, not the feature.
- `/privacy`'s "paste a shopping list". It describes an action, not the feature's name.
- The `Quick View` button on product cards. The owner chose "Quick Shop" knowing the two sit near
  each other (recorded on `#1145`).
- Historical specs, the CHANGELOG's past entries and the generated `docs.ts` embed, which keep the
  names they were written with.

## Open items carried forward

- **The textarea placeholder** ("Type or paste your list, one item per line") nearly repeats the new
  label. This spec leaves it unchanged, because the approved copy did not cover it and `#1077`
  chose it for a reason. If the owner wants it changed or removed, that is a decision for spec
  review, not Build.

## Risks the validator should test rather than assume

- **The header link must still fit.** "Quick Shop" is shorter than "Shopping List", so the 1280px
  search form must not be narrower than `#1142` measured (603px). The link must keep its 44 by 44
  box at phone widths.
- **A test anchored on old wording.** The hint-placement test must still prove that the hint comes
  before the textarea, anchored on the new text. It must not be deleted.
- **A missed surface.** Rendered HTML, not source, is the check that no shopper-visible
  "Shop your list" or "Shopping List" remains.
